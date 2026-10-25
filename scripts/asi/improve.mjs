/**
 * Userward self-upgrade loop (Tier 2 code, Tier 3 product face).
 *
 *   npm run asi:improve -- --goal "Sidebar text is hard to read"
 *   npm run asi:improve -- --feedback C:\Users\me\Downloads\userward-feedback-2026-10-24.json
 *   npm run asi:improve -- --edits proposal.json        (judge a patch written by another agent)
 *   npm run asi:improve -- --goal "..." --dry-run       (baseline + context only, no model call)
 *
 * Options: --tier 2|3  --rounds N  --candidates K  --no-build  --files a,b  --keep-sandboxes  --include-processed
 *
 * Every candidate runs in a sandbox copy. The proposer cannot edit tests, benchmarks or these
 * scripts. Nothing reaches the real project until `npm run asi:promote -- <id> --yes`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  PROJECT_ROOT, STATE_DIR, SANDBOX_ROOT, appendArchive, collectMetrics, createSandbox, ensureProjectRoot,
  evaluateCandidate, evaluationInputsHash, gitDiff, hashFile, latestEvent, newId, readArchive, readText, removeSandbox, runGates, writeText,
} from "./core.mjs";
import { applyProposal, buildPolicy, checkEditPath } from "./policy.mjs";
import { callModel, parseProposal, readConfig, resolveModelConfig } from "./llm.mjs";
import { classifyCritique, upgradeTierFor } from "../../app/lib/adaptive-preferences.ts";

const { values: args } = parseArgs({
  options: {
    goal: { type: "string" },
    feedback: { type: "string" },
    edits: { type: "string" },
    tier: { type: "string" },
    rounds: { type: "string", default: "2" },
    candidates: { type: "string", default: "2" },
    files: { type: "string" },
    "no-build": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    "keep-sandboxes": { type: "boolean", default: false },
    "include-processed": { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const log = (line) => console.log(line);
const PROCESSED_PATH = join(STATE_DIR, "processed.json");
const BASELINE_PATH = join(STATE_DIR, "baseline.json");
// Keep prompts small enough for economy models (~8k TPM). Prefer keyword windows over dumping whole files.
const CONTEXT_BUDGET = 18_000;
const MAX_MODEL_CALLS = 12;

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

function loadFeedback() {
  const items = [];
  const processed = new Set(readJson(PROCESSED_PATH, []));
  if (args.goal) {
    const tags = classifyCritique(args.goal);
    const tier = upgradeTierFor(tags);
    // Tier 1 (answer style) is not a code/UI self-upgrade — refuse unless --tier forces 2|3.
    if (!args.tier && tier < 2) {
      log("This goal is answer-style (Tier 1), not an app UI/code fix. Save it as an Adaptive preference in Settings, or rephrase focusing on the app UI (e.g. \"code blocks in answers lose indentation\").");
      process.exitCode = 3;
      return { tier: 1, items: [] };
    }
    items.push({ id: `goal-${Date.now()}`, comment: args.goal.slice(0, 800), tags, tier: args.tier ? Number(args.tier) : Math.max(2, tier), excerpt: "" });
  }
  const inbox = join(STATE_DIR, "inbox");
  const files = args.feedback
    ? args.feedback.split(",").map(path => path.trim()).filter(Boolean)
    : !args.goal && existsSync(inbox) ? readdirSync(inbox).filter(name => name.endsWith(".json")).map(name => join(inbox, name)) : [];
  for (const file of files) {
    const data = readJson(file, null);
    if (data?.kind !== "userward-asi-feedback" || !Array.isArray(data.items)) { log(`! Skipping ${file}: not a Userward feedback export.`); continue; }
    for (const item of data.items) {
      if (!item?.comment || (!args["include-processed"] && processed.has(item.id))) continue;
      const tags = Array.isArray(item.tags) && item.tags.length ? item.tags : classifyCritique(item.comment);
      items.push({ ...item, tags, tier: item.tier || upgradeTierFor(tags) });
    }
  }
  const forced = args.tier ? Number(args.tier) : null;
  if (forced && ![2, 3].includes(forced)) throw new Error("--tier must be 2 or 3.");
  const upgradeable = items.filter(item => forced ? true : item.tier >= 2);
  if (!upgradeable.length) return { tier: forced || 2, items: [] };
  const tier = forced || (upgradeable.filter(item => item.tier === 3).length >= upgradeable.filter(item => item.tier === 2).length ? 3 : 2);
  return { tier, items: forced ? upgradeable : upgradeable.filter(item => item.tier === tier) };
}

const MAX_BLIND_ROUNDS = 3;
const normalizeComment = (text) => String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Returns a message when the loop must stop and ask for criteria instead of revising blindly. */
function criteriaCheck(items, archive = readArchive()) {
  const concrete = items.filter(item => !item.tags.includes("vague") && keywordsFrom([item], 2).length > 0);
  if (!concrete.length) {
    return "Feedback is too vague to act on (\"vẫn chưa ưng\"). Say what 'good' looks like — e.g. which screen, which element, denser or sparser, which colour, how fast — then re-run.";
  }
  const kept = new Set([...archive.values()].filter(cand => latestEvent(cand, ["pick", "promote"])?.choice === "keep" || latestEvent(cand, ["promote"])).flatMap(cand => cand.feedbackComments || []));
  for (const item of concrete) {
    const key = normalizeComment(item.comment);
    if (!key || kept.has(key)) continue;
    const priorRuns = new Set([...archive.values()].filter(cand => (cand.feedbackComments || []).includes(key)).map(cand => cand.runId)).size;
    if (priorRuns >= MAX_BLIND_ROUNDS) {
      return `This complaint has already been tried in ${priorRuns} runs and nothing was kept: "${item.comment.slice(0, 120)}". Blind retries stop here. Tell me the acceptance criterion (what exactly should change and how you will judge it), or preview the previous candidates with asi:status / asi:preview.`;
    }
  }
  return null;
}

function walkEditable(root, policy, dir = "app", out = []) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walkEditable(root, policy, rel, out);
    else if (checkEditPath(rel, policy).ok) out.push(rel);
  }
  return out;
}

const STOP = new Set("this that with from have they them their what when where which while there these those than then very more much into your about would could should cũng những được trong không của như này khi người phải là và với cho các một rất".split(" "));

function keywordsFrom(items, tier) {
  const words = new Set();
  for (const item of items) for (const word of item.comment.toLowerCase().match(/[\p{L}\d_-]{4,}/gu) || []) if (!STOP.has(word)) words.add(word);
  if (tier === 3) ["color", "background", "font-size", "contrast", "sidebar", "composer"].forEach(word => words.add(word));
  return [...words].slice(0, 24);
}

function windowsFor(text, needles, radius, max) {
  const spans = [];
  for (const needle of needles) {
    let at = text.toLowerCase().indexOf(needle.toLowerCase());
    let hits = 0;
    while (at >= 0 && hits < max) {
      spans.push([Math.max(0, at - radius), Math.min(text.length, at + needle.length + radius)]);
      hits += 1;
      at = text.toLowerCase().indexOf(needle.toLowerCase(), at + needle.length);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

function buildContext({ root, policy, items, tier, baseline }) {
  const files = walkEditable(root, policy);
  const keywords = keywordsFrom(items, tier);
  const blocks = [];
  let used = 0;
  const push = (path, text, spans) => {
    for (const [start, end] of spans) {
      if (used >= CONTEXT_BUDGET) return;
      const slice = text.slice(start, Math.min(end, start + (CONTEXT_BUDGET - used)));
      blocks.push(`=== FILE ${path} (chars ${start}-${start + slice.length} of ${text.length}) ===\n${slice}`);
      used += slice.length;
    }
  };
  const explicit = (args.files || "").split(",").map(path => path.trim()).filter(Boolean);
  for (const path of explicit) {
    const text = readText(join(root, path));
    if (text == null || !checkEditPath(path, policy).ok) continue;
    push(path, text, text.length <= 40_000 ? [[0, text.length]] : windowsFor(text, keywords, 1400, 3));
  }
  if (tier === 3) {
    const selectors = (baseline.metrics.ui.worst || []).map(item => item.selector.slice(0, 80));
    for (const path of ["app/globals.css", "app/sidebar-contrast.css"]) {
      const text = readText(join(root, path));
      if (text) push(path, text, windowsFor(text, [...selectors, ...keywords.slice(0, 8)], 700, 2));
    }
    const layout = readText(join(root, "app/layout.tsx"));
    if (layout && layout.length < 12_000) push("app/layout.tsx", layout, [[0, layout.length]]);
  }
  const ranked = files
    .filter(path => !explicit.includes(path) && !(tier === 3 && /\.css$/.test(path)))
    .map(path => {
      const text = readText(join(root, path)) || "";
      const lower = text.toLowerCase();
      return { path, text, hits: keywords.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0) };
    })
    .filter(file => file.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 6);
  for (const file of ranked) push(file.path, file.text, file.text.length <= 12_000 ? [[0, file.text.length]] : windowsFor(file.text, keywords, 1200, 2));
  const listing = files.map(path => `${path} (${(readText(join(root, path)) || "").length} chars)`).join("\n");
  return { blocks, listing, keywords };
}

const SYSTEM_PROMPT = `You are the self-upgrade engine of Userward, a local-first AI assistant web app (React 19 + vinext, TypeScript, plain CSS).
You change Userward's OWN source code to address user feedback. Your change is applied in a sandbox and judged by hidden tests,
benchmarks and objective UI metrics you cannot see or edit. Regressions are rejected automatically.

Reply with ONE JSON object only, no prose, schema:
{"summary": "one line", "rationale": "why this fixes the feedback and why it is safe",
 "edits": [{"path": "app/...", "search": "exact text copied verbatim from a FILE block", "replace": "new text"}],
 "newFiles": [{"path": "tests/asi/<name>.test.ts", "content": "node:test file proving the fix"}]}

Rules:
- RED zone (never editable, proposals touching it are rejected whole): app/api/**, safety-experience, policy-rag, userward-core, send-guards, hands, custom-provider, provider-connect-errors, adaptive-preferences, chatgpt-auth, and everything outside app/ (tests, scripts, benchmarks, configs).
- YELLOW zone (small edits only, replacement ≤ 3000 chars, ≤ 6 edits per file, size may not change by more than ~10%): page.tsx, layout.tsx, i18n.ts, chat-contract, interview-*, role-routing, openrouter-routing, model-capabilities, file-extraction.
- GREEN zone (normal edits, replacement ≤ 8000 chars): CSS files and the remaining app/lib helpers.
- Content rules in any zone: never add fetch/WebSocket/sendBeacon, external URLs, eval/new Function, process.env, fs/child_process, dangerouslySetInnerHTML, storage wipes, or dynamic imports. Never empty or rewrite a whole file.
- You may only ADD tests under tests/asi/ (no fs/network/env in them).
- "search" must appear exactly once in the file. Copy it character-for-character from the shown snippet; keep it short but unique.
- Minimal, focused edits (max 12). No new dependencies. Keep existing behavior and exports intact.
- User-visible strings go through t("key") with both English and Vietnamese entries in app/lib/i18n.ts.
- UI feedback: prefer adjusting colors, spacing, font sizes and tokens in CSS; keep WCAG text contrast >= 4.5:1 in light and dark themes.
- Speed feedback: prefer less work on the client (lazy work, smaller bundles, fewer re-renders), never remove features.
- Never weaken safety checks, secret redaction, approvals, or local-only guarantees.`;

function buildUserPrompt({ items, tier, baseline, context, lastFailure }) {
  const feedback = items.map((item, index) => `${index + 1}. [${item.tags.join(", ")}] ${item.comment}${item.excerpt ? `\n   Context: ${item.excerpt.slice(0, 400)}` : ""}`).join("\n");
  const m = baseline.metrics;
  return [
    `UPGRADE TIER: ${tier === 3 ? "3 — product face (UI / speed)" : "2 — app behavior / bugs"}`,
    "USER FEEDBACK:",
    feedback,
    "",
    "CURRENT OBJECTIVE METRICS (baseline):",
    `- tests passed/failed: ${m.testsPassed}/${m.testsFailed}; Quality-70 pass rate: ${m.qualityPassRate ?? "n/a"}%`,
    `- UI contrast failures (<4.5:1): ${m.ui.contrastFails}; min contrast ${m.ui.minContrast}; !important count ${m.ui.importantCount}; font-size variants ${m.ui.fontSizeVariants}`,
    m.clientJsBytes ? `- client JS ${Math.round(m.clientJsBytes / 1024)} KB, CSS ${Math.round((m.clientCssBytes || 0) / 1024)} KB` : "",
    m.ui.worst?.length ? `- worst contrast rules:\n${m.ui.worst.slice(0, 10).map(item => `  ${item.ratio}:1  ${item.selector}`).join("\n")}` : "",
    lastFailure ? `\nPREVIOUS ATTEMPT WAS REJECTED — fix this:\n${lastFailure}` : "",
    "",
    "EDITABLE FILES:",
    context.listing,
    "",
    ...context.blocks,
  ].filter(line => line !== "").join("\n");
}

function summarizeFailure(result) {
  const parts = [...(result.errors || []), ...(result.regressions || [])];
  const failed = (result.gates || []).filter(gate => !gate.ok).map(gate => `gate ${gate.id} output tail:\n${gate.tail.slice(-1200)}`);
  return [...parts, ...failed].join("\n").slice(0, 3000);
}

async function main() {
  ensureProjectRoot();
  const config = readConfig();
  const policy = buildPolicy(config.policy);
  const build = !args["no-build"];
  const { tier, items } = loadFeedback();
  if (!items.length && !args.edits) {
    if (process.exitCode === 3) return; // already explained (Tier-1 style goal, or similar)
    log("No Tier-2/3 feedback to work on. Use --goal \"...\" or export feedback from Settings → Adaptive preferences and pass --feedback <file> (or drop it in .userward/asi/inbox/).");
    process.exitCode = 2;
    return;
  }
  // Ask-criteria rule: vague feedback, or the same complaint already tried 3 times with nothing kept → stop and ask.
  const blocked = criteriaCheck(items);
  if (blocked && !args.edits) {
    log(blocked);
    process.exitCode = 3;
    return;
  }
  const runId = newId("run");
  const runDir = join(STATE_DIR, "runs", runId);
  log(`Userward self-upgrade ${runId} · tier ${tier} · ${items.length} feedback item(s) · sandboxes in ${SANDBOX_ROOT}`);

  const baselineKey = `${evaluationInputsHash(PROJECT_ROOT)}:${build ? "build" : "nobuild"}`;
  let baseline = readJson(BASELINE_PATH, null);
  if (baseline?.key !== baselineKey) {
    log("• Baseline: running gates on an unmodified sandbox copy…");
    const id = newId("base");
    const dir = createSandbox(PROJECT_ROOT, id);
    try {
      const gates = runGates(dir, { build });
      baseline = { key: baselineKey, gates: gates.map(({ tail, ...gate }) => ({ ...gate, tail: tail.slice(-600) })), metrics: collectMetrics(dir, gates), at: new Date().toISOString() };
      writeText(BASELINE_PATH, JSON.stringify(baseline, null, 2));
    } finally {
      removeSandbox(dir);
    }
  } else log("• Baseline: cached (no source changes since last run).");
  log(`  gates ${baseline.gates.map(gate => `${gate.id}:${gate.ok ? "ok" : "FAIL"}`).join(" ")}`);
  log(`  tests ${baseline.metrics.testsPassed} pass / ${baseline.metrics.testsFailed} fail · Quality-70 ${baseline.metrics.qualityPassRate ?? "n/a"}% · contrast fails ${baseline.metrics.ui.contrastFails}`);

  const context = buildContext({ root: PROJECT_ROOT, policy, items, tier, baseline });
  if (args["dry-run"]) {
    const prompt = buildUserPrompt({ items, tier, baseline, context, lastFailure: "" });
    writeText(join(runDir, "prompt.txt"), `${SYSTEM_PROMPT}\n\n---\n\n${prompt}`);
    log(`• Dry run: context ${context.blocks.length} block(s), ${prompt.length} chars → ${join(runDir, "prompt.txt")}`);
    return;
  }

  const modelConfig = resolveModelConfig(config);
  const manual = args.edits ? JSON.parse(readFileSync(args.edits, "utf8")) : null;
  if (!manual && !modelConfig.ready) {
    log("No model key for proposals. Set ASI_API_KEY (+ ASI_BASE_URL, ASI_MODEL), or OPENROUTER_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY, or pass --edits <proposal.json>.");
    process.exitCode = 2;
    return;
  }
  const rounds = manual ? 1 : Math.max(1, Math.min(5, Number(args.rounds) || 2));
  const perRound = manual ? 1 : Math.max(1, Math.min(4, Number(args.candidates) || 2));
  if (!manual) log(`• Proposer: ${modelConfig.provider} · ${modelConfig.model} · ${rounds} round(s) × ${perRound} candidate(s)`);

  let parent = { id: null, dir: PROJECT_ROOT, touched: [], newTests: [], score: 0 };
  let calls = 0;
  let lastFailure = "";
  const usage = { promptTokens: 0, completionTokens: 0 };
  const all = [];

  for (let round = 1; round <= rounds; round += 1) {
    const roundResults = [];
    for (let k = 1; k <= perRound; k += 1) {
      let proposal;
      if (manual) proposal = { summary: manual.summary || "Manual proposal", rationale: manual.rationale || "", edits: manual.edits || [], newFiles: manual.newFiles || [] };
      else {
        if (calls >= MAX_MODEL_CALLS) break;
        calls += 1;
        log(`• Round ${round} · candidate ${k}: asking model…`);
        try {
          const contextNow = parent.dir === PROJECT_ROOT ? context : buildContext({ root: parent.dir, policy, items, tier, baseline });
          const reply = await callModel({ system: SYSTEM_PROMPT, user: buildUserPrompt({ items, tier, baseline, context: contextNow, lastFailure }) });
          usage.promptTokens += reply.usage.promptTokens;
          usage.completionTokens += reply.usage.completionTokens;
          proposal = parseProposal(reply.text);
        } catch (error) {
          lastFailure = `Model/JSON error: ${error.message}`;
          log(`  ✗ ${lastFailure}`);
          continue;
        }
      }

      const id = newId("cand");
      const dir = createSandbox(parent.dir, id);
      const applied = applyProposal(proposal, rel => readText(join(dir, rel)), policy);
      let result;
      if (!applied.ok) {
        result = { verdict: "rejected", score: 0, errors: applied.errors, regressions: [], gains: [], gates: [], metrics: null };
      } else {
        for (const [rel, text] of applied.changed) writeText(join(dir, rel), text);
        const newTests = [...new Set([...parent.newTests, ...[...applied.created].filter(path => path.startsWith("tests/asi/"))])];
        log(`  running gates in sandbox ${id}…`);
        const gates = runGates(dir, { build, newTests });
        const metrics = collectMetrics(dir, gates);
        result = { ...evaluateCandidate({ tier, baseline, candidate: { gates, metrics } }), gates, metrics, newTests };
      }
      const touchedPaths = [...new Set([...parent.touched.map(item => item.path), ...applied.changed.keys()])];
      const touched = touchedPaths.map(path => ({ path, baseHash: hashFile(join(PROJECT_ROOT, path)), created: !existsSync(join(PROJECT_ROOT, path)) }));
      const diffPath = join(runDir, `${id}.diff`);
      if (applied.ok) writeText(diffPath, touched.map(item => gitDiff(join(PROJECT_ROOT, item.path), join(dir, item.path), item.path)).join("\n"));

      const record = {
        type: "candidate", id, runId, round, parentId: parent.id, tier,
        feedbackIds: items.map(item => item.id), feedbackComments: items.map(item => normalizeComment(item.comment)), summary: proposal.summary, rationale: proposal.rationale,
        verdict: result.verdict, score: result.score, gains: result.gains, regressions: result.regressions, errors: result.errors || [],
        gates: (result.gates || []).map(gate => ({ id: gate.id, ok: gate.ok, ms: gate.ms, pass: gate.pass, fail: gate.fail })),
        metrics: result.metrics, touched, newTests: result.newTests || parent.newTests,
        sandbox: result.verdict === "rejected" && !args["keep-sandboxes"] ? null : dir,
        diffPath: applied.ok ? diffPath : null,
      };
      appendArchive(record);
      if (record.sandbox === null) removeSandbox(dir);
      const mark = result.verdict === "improved" ? "✓" : result.verdict === "needs_user_check" ? "?" : "✗";
      log(`  ${mark} ${id} ${result.verdict} score ${result.score}${result.gains.length ? ` · ${result.gains.join(", ")}` : ""}${result.regressions.length || record.errors.length ? ` · ${[...record.errors, ...result.regressions].join("; ").slice(0, 300)}` : ""}`);
      roundResults.push({ ...record, dir, result });
      all.push(record);
      if (result.verdict === "rejected") lastFailure = summarizeFailure({ ...result, errors: record.errors });
    }
    const best = roundResults.filter(item => item.verdict !== "rejected").sort((a, b) => b.score - a.score)[0];
    if (best && (best.score > parent.score || parent.id === null)) {
      parent = { id: best.id, dir: best.dir, touched: best.touched, newTests: best.newTests, score: best.score };
      lastFailure = "";
      log(`• Round ${round} winner: ${best.id} (score ${best.score}). Next round builds on it.`);
    } else log(`• Round ${round}: no candidate beat the current best.`);
  }

  const winner = all.find(item => item.id === parent.id) || null;
  if (winner && items.length) {
    const processed = new Set(readJson(PROCESSED_PATH, []));
    items.forEach(item => processed.add(item.id));
    writeText(PROCESSED_PATH, JSON.stringify([...processed], null, 2));
  }

  const row = (item) => `| ${item.id} | ${item.round} | ${item.verdict} | ${item.score} | ${[...item.gains, ...item.regressions, ...item.errors].join("; ").replace(/\|/g, "/").slice(0, 160)} | ${String(item.summary || "").replace(/\|/g, "/").slice(0, 120)} |`;
  const report = [
    `# Self-upgrade ${runId}`,
    "",
    `- Tier: ${tier} · build gate: ${build ? "on" : "off"} · proposer: ${manual ? "manual --edits" : `${modelConfig.provider}/${modelConfig.model}`}`,
    `- Model tokens: ${usage.promptTokens} in / ${usage.completionTokens} out`,
    `- Baseline: tests ${baseline.metrics.testsPassed}/${baseline.metrics.testsFailed} · Quality-70 ${baseline.metrics.qualityPassRate ?? "n/a"}% · contrast fails ${baseline.metrics.ui.contrastFails}`,
    "",
    "## Feedback",
    ...items.map(item => `- [${item.tags.join(", ")}] ${item.comment}`),
    "",
    "## Candidates",
    "| id | round | verdict | score | evidence | summary |",
    "|---|---|---|---|---|---|",
    ...all.map(row),
    "",
    "## Next",
    winner
      ? [
          `Best: **${winner.id}** (${winner.verdict}). Diff: \`${winner.diffPath}\``,
          `1. Try it: \`npm run asi:preview -- ${winner.id}\` → open http://127.0.0.1:3002 next to http://127.0.0.1:3001`,
          `2. Decide: \`npm run asi:pick -- ${winner.id} keep\` (or \`reject\`)`,
          `3. Apply: \`npm run asi:promote -- ${winner.id} --yes\`, then restart START-USERWARD.cmd`,
          `4. Undo anytime: \`npm run asi:rollback -- ${winner.id} --yes\``,
        ].join("\n")
      : "No acceptable candidate. Feedback stays in the queue; refine the goal, add --files, or try another model.",
  ].join("\n");
  writeText(join(runDir, "report.md"), report);
  log(`\nReport: ${join(runDir, "report.md")}`);
  if (winner) log(`Best candidate: ${winner.id} (${winner.verdict}). Preview: npm run asi:preview -- ${winner.id}`);
  else process.exitCode = 1;
}

main().catch(error => {
  console.error(`Self-upgrade failed: ${error.message}`);
  process.exitCode = 1;
});
