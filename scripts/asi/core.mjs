/**
 * Sandbox, gates, metrics and archive for the self-upgrade loop.
 * Sandboxes live outside the repo (default: OS temp) so the live app and its
 * build are never touched until a candidate is explicitly promoted.
 */
import { createHash } from "node:crypto";
import {
  appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync,
  rmSync, rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { auditProject } from "./ui-audit.mjs";

export const PROJECT_ROOT = resolve(process.cwd());
export const STATE_DIR = join(PROJECT_ROOT, ".userward", "asi");
export const SANDBOX_ROOT = resolve(process.env.ASI_SANDBOX_ROOT || join(tmpdir(), "userward-asi", basename(PROJECT_ROOT).replace(/[^\w.-]+/g, "_")));
export const ARCHIVE_PATH = join(STATE_DIR, "archive.jsonl");
export const PREVIEW_PORT = 3002;

const COPY_EXCLUDE = new Set([
  "node_modules", "dist", ".git", ".userward", ".wrangler", ".next", "outputs", "work",
  "release", ".auditor", ".expectation-guard", ".audit", "coverage", ".cursor",
]);

export const DEFAULT_GATES = [
  { id: "contracts", cmd: "npm run test:contracts", kind: "test" },
  { id: "i18n", cmd: "npm run test:i18n", kind: "test" },
  { id: "core", cmd: "npm run test:userward-core", kind: "test" },
  { id: "policy", cmd: "npm run test:policy", kind: "test" },
  { id: "quality70", cmd: "node --experimental-strip-types scripts/run-quality-70.mjs", kind: "bench" },
  { id: "build", cmd: "npx vinext build", kind: "build" },
];

export function ensureProjectRoot() {
  const pkgPath = join(PROJECT_ROOT, "package.json");
  if (!existsSync(pkgPath) || !existsSync(join(PROJECT_ROOT, "app"))) {
    throw new Error("Run from the Userward project root (package.json + app/ not found).");
  }
  mkdirSync(STATE_DIR, { recursive: true });
  mkdirSync(SANDBOX_ROOT, { recursive: true });
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function hashFile(path) {
  return existsSync(path) ? sha256(readFileSync(path)) : null;
}

export function readText(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function newId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

function assertInsideSandboxRoot(dir) {
  const rel = relative(SANDBOX_ROOT, resolve(dir));
  if (!rel || isAbsolute(rel) || rel.startsWith("..") || rel.includes(`..${sep}`) || resolve(dir) === SANDBOX_ROOT) {
    throw new Error(`Refusing to touch a path outside the sandbox root: ${dir}`);
  }
}

/** Copy project (or a parent sandbox) into a fresh sandbox and link node_modules. */
export function createSandbox(sourceDir, id) {
  const dir = join(SANDBOX_ROOT, id);
  assertInsideSandboxRoot(dir);
  if (existsSync(dir)) throw new Error(`Sandbox already exists: ${dir}`);
  mkdirSync(dir, { recursive: true });
  const outDir = `${sep}benchmarks${sep}out`;
  for (const entry of readdirSync(sourceDir)) {
    if (COPY_EXCLUDE.has(entry)) continue;
    if (/^\.env(\.|$)/.test(entry)) continue; // never copy secrets into a temp sandbox
    cpSync(join(sourceDir, entry), join(dir, entry), {
      recursive: true,
      filter: source => !source.includes(outDir),
    });
  }
  symlinkSync(join(PROJECT_ROOT, "node_modules"), join(dir, "node_modules"), "junction");
  return dir;
}

function unlinkModules(dir) {
  const link = join(dir, "node_modules");
  let info;
  try { info = lstatSync(link); } catch { return; }
  if (!info.isSymbolicLink()) throw new Error(`node_modules in ${dir} is not a link; refusing to delete the sandbox.`);
  try { unlinkSync(link); } catch { rmdirSync(link); }
  if (existsSync(link)) throw new Error(`Could not unlink ${link}`);
}

export function removeSandbox(dir) {
  if (!dir || !existsSync(dir)) return;
  assertInsideSandboxRoot(dir);
  unlinkModules(dir);
  if (!existsSync(join(PROJECT_ROOT, "node_modules"))) throw new Error("Project node_modules disappeared; aborting cleanup.");
  rmSync(dir, { recursive: true, force: true });
}

export function runCommand(cmd, cwd, timeoutMs = 10 * 60_000) {
  const started = Date.now();
  const result = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    // No sandbox marker in env: app code must not be able to tell it is being evaluated.
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  return {
    cmd,
    ok: result.status === 0,
    code: result.status,
    ms: Date.now() - started,
    timedOut: result.error?.code === "ETIMEDOUT",
    tail: output.slice(-4000),
    pass: [...output.matchAll(/ℹ pass (\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0),
    fail: [...output.matchAll(/ℹ fail (\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0),
  };
}

function sumBytes(dir, pattern) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += sumBytes(path, pattern);
    else if (pattern.test(entry.name)) total += statSync(path).size;
  }
  return total;
}

export function runGates(dir, { gates = DEFAULT_GATES, build = true, newTests = [] } = {}) {
  const selected = gates.filter(gate => build || gate.kind !== "build");
  const results = selected.map(gate => ({ id: gate.id, kind: gate.kind, ...runCommand(gate.cmd, dir) }));
  if (newTests.length) {
    const cmd = `node --experimental-strip-types --test ${newTests.map(path => `"${path}"`).join(" ")}`;
    results.push({ id: "asi-new-tests", kind: "test", ...runCommand(cmd, dir) });
  }
  return results;
}

export function collectMetrics(dir, gates) {
  // Proposer-added tests are a pass/fail gate only; they never count as "more tests passing",
  // otherwise a trivially-true test would buy an "improved" verdict.
  const testGates = gates.filter(gate => gate.kind === "test" && gate.id !== "asi-new-tests");
  const quality = (() => {
    try { return JSON.parse(readFileSync(join(dir, "benchmarks", "out", "quality-70-summary.json"), "utf8")).summary; }
    catch { return null; }
  })();
  const build = gates.find(gate => gate.id === "build");
  const ui = auditProject(dir);
  return {
    testsPassed: testGates.reduce((sum, gate) => sum + gate.pass, 0),
    testsFailed: testGates.reduce((sum, gate) => sum + gate.fail, 0),
    qualityPassRate: quality ? Number(quality.passRate) : null,
    qualitySavedPct: quality ? Number(quality.avgSavedPct) : null,
    buildMs: build?.ok ? build.ms : null,
    clientJsBytes: build?.ok ? sumBytes(join(dir, "dist", "client"), /\.js$/) : null,
    clientCssBytes: build?.ok ? sumBytes(join(dir, "dist", "client"), /\.css$/) : null,
    ui: { contrastFails: ui.contrastFails, minContrast: ui.minContrast, importantCount: ui.importantCount, fontSizeVariants: ui.fontSizeVariants, cssBytes: ui.cssBytes, worst: ui.worst },
  };
}

/**
 * Compare against the baseline. Hard rule: no gate that passed at baseline may fail,
 * and no tracked metric may regress. Score = objective improvement for the tier.
 */
export function evaluateCandidate({ tier, baseline, candidate }) {
  const regressions = [];
  for (const gate of candidate.gates) {
    const before = baseline.gates.find(item => item.id === gate.id);
    if (before?.ok && !gate.ok) regressions.push(`gate ${gate.id} now fails`);
    if (!before && !gate.ok) regressions.push(`new gate ${gate.id} fails`);
  }
  const b = baseline.metrics;
  const c = candidate.metrics;
  if (c.testsFailed > b.testsFailed) regressions.push(`failing tests ${b.testsFailed} → ${c.testsFailed}`);
  if (b.qualityPassRate != null && c.qualityPassRate != null && c.qualityPassRate < b.qualityPassRate) regressions.push(`Quality-70 ${b.qualityPassRate}% → ${c.qualityPassRate}%`);
  if (c.ui.contrastFails > b.ui.contrastFails) regressions.push(`contrast failures ${b.ui.contrastFails} → ${c.ui.contrastFails}`);
  if (b.clientJsBytes && c.clientJsBytes && c.clientJsBytes > b.clientJsBytes * 1.1) regressions.push(`client JS +${Math.round((c.clientJsBytes / b.clientJsBytes - 1) * 100)}%`);

  const kb = (value) => (value || 0) / 1024;
  let score = 0;
  const gains = [];
  const contrastGain = b.ui.contrastFails - c.ui.contrastFails;
  const importantGain = b.ui.importantCount - c.ui.importantCount;
  const jsGain = b.clientJsBytes && c.clientJsBytes ? kb(b.clientJsBytes - c.clientJsBytes) : 0;
  const cssGain = b.clientCssBytes && c.clientCssBytes ? kb(b.clientCssBytes - c.clientCssBytes) : 0;
  const testsGain = c.testsPassed - b.testsPassed;
  const failGain = b.testsFailed - c.testsFailed;
  const qualityGain = b.qualityPassRate != null && c.qualityPassRate != null ? c.qualityPassRate - b.qualityPassRate : 0;
  if (tier === 3) {
    score += contrastGain * 10 + importantGain * 0.05 + jsGain * 0.05 + cssGain * 0.1;
  } else {
    score += failGain * 10 + testsGain * 2 + qualityGain * 5 + contrastGain * 2;
  }
  if (contrastGain > 0) gains.push(`contrast failures −${contrastGain}`);
  if (failGain > 0) gains.push(`failing tests −${failGain}`);
  if (testsGain > 0) gains.push(`new passing tests +${testsGain}`);
  if (qualityGain > 0) gains.push(`Quality-70 +${qualityGain}pt`);
  if (jsGain >= 1) gains.push(`client JS −${Math.round(jsGain)} KB`);
  if (cssGain >= 1) gains.push(`client CSS −${Math.round(cssGain)} KB`);
  score = Math.round(score * 100) / 100;

  const verdict = regressions.length ? "rejected" : score > 0 ? "improved" : "needs_user_check";
  return { verdict, score: regressions.length ? 0 : score, regressions, gains };
}

export function appendArchive(record) {
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(ARCHIVE_PATH, `${JSON.stringify({ ...record, at: new Date().toISOString() })}\n`);
}

/** Fold the append-only archive into candidates with their latest events. */
export function readArchive() {
  if (!existsSync(ARCHIVE_PATH)) return new Map();
  const candidates = new Map();
  for (const line of readFileSync(ARCHIVE_PATH, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row.type === "candidate") candidates.set(row.id, { ...row, events: [] });
    else if (row.type === "event" && candidates.has(row.candidateId)) candidates.get(row.candidateId).events.push(row);
  }
  return candidates;
}

export function latestEvent(candidate, names) {
  return [...(candidate?.events || [])].reverse().find(event => names.includes(event.event)) || null;
}

export function gitDiff(fromPath, toPath, label) {
  const from = existsSync(fromPath) ? fromPath : process.platform === "win32" ? "NUL" : "/dev/null";
  const result = spawnSync("git", ["diff", "--no-index", "--no-color", "--", from, toPath], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const text = result.stdout || "";
  if (!text && result.status !== 0 && result.status !== 1) return `--- ${label}\n(diff unavailable: ${result.stderr || result.error?.message || "git not found"})\n`;
  return text.replaceAll(fromPath.replace(/\\/g, "/"), `a/${label}`).replaceAll(toPath.replace(/\\/g, "/"), `b/${label}`);
}

/** Content hash of everything that affects the evaluation, for baseline caching. */
export function evaluationInputsHash(root) {
  const hash = createHash("sha256");
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "out" || entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else { hash.update(relative(root, path)); hash.update(readFileSync(path)); }
    }
  };
  for (const dir of ["app", "scripts", "tests", "benchmarks"]) walk(join(root, dir));
  for (const file of ["package.json", "vite.config.ts"]) if (existsSync(join(root, file))) hash.update(readFileSync(join(root, file)));
  return hash.digest("hex");
}
