/**
 * Human-in-the-loop controls for self-upgrade candidates.
 *
 *   npm run asi:status
 *   npm run asi:preview  -- <id> [--port 3002]     run the candidate beside the live app
 *   npm run asi:pick     -- <id> keep|reject [--note "..."]
 *   npm run asi:promote  -- <id> --yes [--force]   copy into the project (backup + stale check)
 *   npm run asi:rollback -- <id> --yes [--force]
 *   npm run asi:clean    [-- --all]
 */
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import {
  PREVIEW_PORT, PROJECT_ROOT, SANDBOX_ROOT, STATE_DIR, appendArchive, ensureProjectRoot, hashFile,
  latestEvent, readArchive, removeSandbox, runCommand, writeText,
} from "./core.mjs";
import { buildPolicy, classifyZone } from "./policy.mjs";
import { readConfig } from "./llm.mjs";

const { values: opts, positionals } = parseArgs({
  options: {
    port: { type: "string" },
    note: { type: "string" },
    yes: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    all: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const [command, id, choice] = positionals;
const log = (line) => console.log(line);
const fail = (message) => { console.error(message); process.exitCode = 1; };
const RESERVED_PORTS = new Set([3000, 3001]);

function getCandidate(candidates) {
  if (!id) throw new Error("Candidate id required. See `npm run asi:status`.");
  const candidate = candidates.get(id);
  if (!candidate) throw new Error(`Unknown candidate ${id}.`);
  return candidate;
}

function decisionOf(candidate) {
  const event = latestEvent(candidate, ["pick", "promote", "rollback"]);
  if (!event) return "pending";
  return event.event === "pick" ? event.choice : event.event === "promote" ? "promoted" : "rolled back";
}

function status(candidates) {
  if (!candidates.size) { log("No candidates yet. Run `npm run asi:improve -- --goal \"...\"`."); return; }
  const rows = [...candidates.values()].slice(-30);
  for (const c of rows) {
    const live = c.sandbox && existsSync(c.sandbox) ? "sandbox" : "no-sandbox";
    log(`${c.id}  tier ${c.tier}  r${c.round}  ${c.verdict.padEnd(16)} score ${String(c.score).padEnd(6)} ${decisionOf(c).padEnd(11)} ${live}  ${String(c.summary || "").slice(0, 80)}`);
    const evidence = [...(c.gains || []), ...(c.regressions || []), ...(c.errors || [])];
    if (evidence.length) log(`    ${evidence.join("; ").slice(0, 200)}`);
  }
}

async function preview(candidates) {
  const candidate = getCandidate(candidates);
  if (!candidate.sandbox || !existsSync(candidate.sandbox)) throw new Error("Candidate sandbox no longer exists.");
  const port = Number(opts.port || PREVIEW_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || RESERVED_PORTS.has(port)) throw new Error("Pick a preview port other than 3000 (RPA tools) and 3001 (live Userward).");
  if (!existsSync(join(candidate.sandbox, "dist", "server", "index.js"))) {
    log("Building candidate…");
    const build = runCommand("npx vinext build", candidate.sandbox);
    if (!build.ok) throw new Error(`Candidate build failed:\n${build.tail.slice(-1500)}`);
  }
  log(`Candidate ${candidate.id} → http://127.0.0.1:${port}  (live app stays on http://127.0.0.1:3001)`);
  log(`Compare both, then: npm run asi:pick -- ${candidate.id} keep   (or reject). Ctrl+C stops the preview.`);
  appendArchive({ type: "event", event: "preview", candidateId: candidate.id, port });
  const child = spawn(`npx vinext start --hostname 127.0.0.1 --port ${port}`, { cwd: candidate.sandbox, shell: true, stdio: "inherit" });
  await new Promise(resolve => child.on("exit", resolve));
}

function pick(candidates) {
  const candidate = getCandidate(candidates);
  if (!["keep", "reject"].includes(choice)) throw new Error("Usage: asi:pick -- <id> keep|reject");
  appendArchive({ type: "event", event: "pick", candidateId: candidate.id, choice, note: (opts.note || "").slice(0, 500) });
  log(`${candidate.id}: ${choice}.${choice === "keep" ? ` Apply with: npm run asi:promote -- ${candidate.id} --yes` : ""}`);
}

function promote(candidates) {
  const candidate = getCandidate(candidates);
  if (!opts.yes) throw new Error("Promotion writes into your project. Re-run with --yes.");
  if (candidate.verdict === "rejected") throw new Error("Rejected candidates cannot be promoted.");
  if (!candidate.sandbox || !existsSync(candidate.sandbox)) throw new Error("Candidate sandbox no longer exists.");
  const decision = decisionOf(candidate);
  if (decision === "promoted") throw new Error("Already promoted.");
  if (decision !== "keep" && !(opts.force && candidate.verdict === "improved")) {
    throw new Error(`A person must confirm this change first: preview it (npm run asi:preview -- ${candidate.id}) and pick keep. --force only skips this for objectively improved candidates.`);
  }
  const stale = candidate.touched.filter(item => hashFile(join(PROJECT_ROOT, item.path)) !== item.baseHash);
  if (stale.length) throw new Error(`Project changed since this candidate was made (${stale.map(item => item.path).join(", ")}). Re-run asi:improve.`);

  const backupDir = join(STATE_DIR, "backups", candidate.id);
  const manifest = [];
  for (const item of candidate.touched) {
    const target = join(PROJECT_ROOT, item.path);
    const existed = existsSync(target);
    if (existed) writeText(join(backupDir, item.path), readFileSync(target));
    manifest.push({ path: item.path, existed });
  }
  writeText(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const promotedHashes = {};
  for (const item of candidate.touched) {
    const source = join(candidate.sandbox, item.path);
    const target = join(PROJECT_ROOT, item.path);
    if (existsSync(source)) { writeText(target, readFileSync(source)); promotedHashes[item.path] = hashFile(target); }
    else if (existsSync(target)) { unlinkSync(target); promotedHashes[item.path] = null; }
  }
  appendArchive({ type: "event", event: "promote", candidateId: candidate.id, backupDir, promotedHashes });
  log(`Promoted ${candidate.id}: ${candidate.touched.map(item => item.path).join(", ")}`);
  // Post-promote smoke in the REAL tree: only suites that are green today, so a pre-existing failure can't block
  // and a new failure always rolls back. Core/policy suites guard the red zone's behavior.
  for (const suite of ["test:i18n", "test:policy", "test:userward-core"]) {
    log(`Checking ${suite} in the real project…`);
    const check = runCommand(`npm run ${suite}`, PROJECT_ROOT);
    if (check.ok) continue;
    log(`${suite} failed after promotion — rolling back automatically.`);
    restore(candidate, backupDir, manifest);
    appendArchive({ type: "event", event: "rollback", candidateId: candidate.id, reason: `post-promote ${suite} failed` });
    throw new Error(check.tail.slice(-1200));
  }
  log(`Done. Rebuild + restart: npm run build:local -- -Start   ·   Undo: npm run asi:rollback -- ${candidate.id} --yes`);
}

function restore(candidate, backupDir, manifest) {
  for (const item of manifest) {
    const target = join(PROJECT_ROOT, item.path);
    if (item.existed) writeText(target, readFileSync(join(backupDir, item.path)));
    else if (existsSync(target)) unlinkSync(target);
  }
}

function rollback(candidates) {
  const candidate = getCandidate(candidates);
  if (!opts.yes) throw new Error("Rollback writes into your project. Re-run with --yes.");
  const promoted = latestEvent(candidate, ["promote", "rollback"]);
  if (promoted?.event !== "promote") throw new Error("This candidate is not currently promoted.");
  const manifestPath = join(promoted.backupDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("Backup missing; restore manually with git.");
  const changedSince = Object.entries(promoted.promotedHashes || {}).filter(([path, hash]) => hashFile(join(PROJECT_ROOT, path)) !== hash);
  if (changedSince.length && !opts.force) throw new Error(`Files edited after promotion (${changedSince.map(([path]) => path).join(", ")}). Re-run with --force to overwrite them.`);
  restore(candidate, promoted.backupDir, JSON.parse(readFileSync(manifestPath, "utf8")));
  appendArchive({ type: "event", event: "rollback", candidateId: candidate.id });
  log(`Rolled back ${candidate.id}. Rebuild + restart: npm run build:local -- -Start`);
}

function clean(candidates) {
  const keep = new Set();
  for (const candidate of candidates.values()) {
    const decision = decisionOf(candidate);
    const disposable = opts.all || candidate.verdict === "rejected" || ["reject", "promoted", "rolled back"].includes(decision);
    if (!candidate.sandbox || !existsSync(candidate.sandbox)) continue;
    if (disposable) { removeSandbox(candidate.sandbox); appendArchive({ type: "event", event: "cleaned", candidateId: candidate.id }); }
    else keep.add(candidate.sandbox);
  }
  let orphans = 0;
  if (existsSync(SANDBOX_ROOT)) {
    for (const name of readdirSync(SANDBOX_ROOT)) {
      const dir = join(SANDBOX_ROOT, name);
      if (!keep.has(dir)) { removeSandbox(dir); orphans += 1; }
    }
  }
  log(`Cleaned. Kept ${keep.size} undecided sandbox(es); removed ${orphans} other folder(s).`);
}

/** Print which zone every app file falls into, so the forbidden area is visible and reviewable. */
function zones() {
  const policy = buildPolicy(readConfig().policy);
  const rows = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(PROJECT_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else rows.push([classifyZone(rel, policy), rel]);
    }
  };
  walk("app");
  const order = { red: 0, yellow: 1, green: 2, outside: 3 };
  rows.sort((a, b) => order[a[0]] - order[b[0]] || a[1].localeCompare(b[1]));
  log("RED = never editable (core security/side effects + evaluator) · YELLOW = small scanned edits · GREEN = normal edits · outside = not a code file");
  for (const [zone, rel] of rows) log(`${zone.toUpperCase().padEnd(8)} ${rel}`);
  log("Evaluator (also RED): scripts/ tests/ benchmarks/ docs/ public/ package.json and build configs. Config may add protections, never remove them.");
}

async function main() {
  ensureProjectRoot();
  const candidates = readArchive();
  switch (command) {
    case "status": return status(candidates);
    case "preview": return preview(candidates);
    case "pick": return pick(candidates);
    case "promote": return promote(candidates);
    case "rollback": return rollback(candidates);
    case "clean": return clean(candidates);
    case "zones": return zones();
    default: throw new Error("Commands: status | zones | preview <id> | pick <id> keep|reject | promote <id> --yes | rollback <id> --yes | clean");
  }
}

main().catch(error => fail(error.message));
