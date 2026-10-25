/**
 * Edit policy for the self-upgrade loop — three zones.
 *
 *  RED    (core): never editable, not overridable by config. Evaluator (scripts/tests/benchmarks/config),
 *                 security & side-effect code (safety, policy, approvals, hands/file writes, providers,
 *                 auth, outbound tools) and the self-upgrade library itself.
 *  YELLOW (restricted): editable with tight limits — small replacements, no wholesale rewrites,
 *                 strict content scan. Large or behavior-critical files.
 *  GREEN  (open): editable within normal limits and the same content scan. Styling, presentation,
 *                 answer-shaping helpers.
 *
 * Config (.userward/asi/config.json → "policy") may only ADD protections, never remove them.
 */

export const HARD_PROTECTED_PREFIXES = ["scripts/", "tests/", "benchmarks/", "docs/", ".userward/", "node_modules/", "dist/", ".git/", "public/", ".github/", ".cursor/"];
export const HARD_PROTECTED_FILES = [
  "package.json", "package-lock.json", "vite.config.ts", "next.config.ts", "tsconfig.json",
  "eslint.config.mjs", "wrangler.jsonc", "wrangler.toml", "START-USERWARD.cmd", "drizzle.config.ts", "postcss.config.mjs",
];
/** Core app code: security, approvals, side effects, provider/auth plumbing, and the upgrade loop's own guard. Immutable. */
export const CORE_PROTECTED = [
  "app/api/",                          // every server route: providers, hands (file writes), tools (outbound fetch)
  "app/lib/safety-experience.ts",
  "app/lib/policy-rag.ts",
  "app/lib/userward-core.ts",
  "app/lib/send-guards.ts",
  "app/lib/hands.ts",
  "app/lib/custom-provider.ts",
  "app/lib/provider-connect-errors.ts",
  "app/lib/adaptive-preferences.ts",   // the self-upgrade/forbidden-request guard must not edit itself
  "app/chatgpt-auth.ts",
  "app/types.d.ts",
];
/** Restricted: allowed, but only small, scanned edits. */
export const RESTRICTED = [
  "app/page.tsx", "app/layout.tsx", "app/lib/i18n.ts", "app/lib/chat-contract.ts",
  "app/lib/interview-pipeline.ts", "app/lib/interview-ontology.ts", "app/lib/role-routing.ts",
  "app/lib/openrouter-routing.ts", "app/lib/model-capabilities.ts", "app/lib/file-extraction.ts",
];
export const DEFAULT_EDITABLE_PREFIXES = ["app/"];
export const NEW_TEST_PREFIX = "tests/asi/";
export const MAX_EDITS = 12;
export const MAX_NEW_FILES = 3;
export const MAX_NEW_FILE_CHARS = 100_000;
export const LIMITS = {
  restricted: { replaceChars: 3_000, editsPerFile: 6, maxShrink: 0.15, maxGrowth: 0.10 },
  open: { replaceChars: 8_000, editsPerFile: 12, maxShrink: 0.40, maxGrowth: 0.50 },
};

/** Patterns whose count may never increase in app code (exfiltration, eval, secrets, side effects). */
export const FORBIDDEN_CONTENT = [
  ["child_process", /child_process/g],
  ["node:fs", /["']node:fs["']|["']fs["']|["']fs\/promises["']/g],
  ["eval", /\beval\s*\(/g],
  ["new Function", /new\s+Function\s*\(/g],
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/g],
  ["document.cookie", /document\.cookie/g],
  ["process.env", /process\.env/g],
  ["external URL", /https?:\/\/(?!127\.0\.0\.1|localhost)[\w.-]+/g],
  ["dynamic import", /\bimport\s*\(\s*[^"'`]/g],
  ["storage wipe", /localStorage\.clear\s*\(|indexedDB\.deleteDatabase/g],
  ["WebSocket/EventSource", /new\s+(WebSocket|EventSource)\s*\(/g],
  ["prototype pollution", /__proto__|constructor\s*\[\s*["']prototype["']\s*\]/g],
  ["fetch", /\bfetch\s*\(/g],
  ["sendBeacon", /navigator\.sendBeacon/g],
];

export function normalizeRelPath(raw) {
  if (typeof raw !== "string") return null;
  const path = raw.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!path || path.includes("\0") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return null;
  if (path.split("/").some(part => part === ".." || part === "." || part === "")) return null;
  return path;
}

function matches(path, list) {
  return list.some(item => item.endsWith("/") ? path.startsWith(item) : path === item);
}

export function buildPolicy(config = {}) {
  const extraProtected = Array.isArray(config.protected) ? config.protected.map(normalizeRelPath).filter(Boolean) : [];
  const extraRestricted = Array.isArray(config.restricted) ? config.restricted.map(normalizeRelPath).filter(Boolean) : [];
  // Config can narrow the editable set but never widen it beyond app/.
  const editable = Array.isArray(config.editable) && config.editable.length
    ? config.editable.map(normalizeRelPath).filter(path => path && DEFAULT_EDITABLE_PREFIXES.some(prefix => path.startsWith(prefix)))
    : DEFAULT_EDITABLE_PREFIXES;
  return {
    editable: editable.length ? editable : DEFAULT_EDITABLE_PREFIXES,
    core: [...CORE_PROTECTED, ...extraProtected],
    restricted: [...RESTRICTED, ...extraRestricted],
  };
}

/** "red" | "yellow" | "green" | "evaluator" | "outside" */
export function classifyZone(raw, policy = buildPolicy()) {
  const path = normalizeRelPath(raw);
  if (!path) return "outside";
  if (matches(path, HARD_PROTECTED_PREFIXES) || HARD_PROTECTED_FILES.includes(path)) return "evaluator";
  if (matches(path, policy.core)) return "red";
  if (!matches(path, policy.editable) || !/\.(ts|tsx|css)$/.test(path)) return "outside";
  if (matches(path, policy.restricted)) return "yellow";
  return "green";
}

export function checkEditPath(raw, policy, { creating = false } = {}) {
  const path = normalizeRelPath(raw);
  if (!path) return { ok: false, reason: "invalid path" };
  if (creating && path.startsWith(NEW_TEST_PREFIX)) {
    return /\.test\.(ts|mjs)$/.test(path)
      ? { ok: true, path, zone: "test" }
      : { ok: false, reason: "new tests must be tests/asi/*.test.ts or *.test.mjs" };
  }
  const zone = classifyZone(path, policy);
  if (zone === "evaluator") return { ok: false, reason: "RED zone: evaluator, tests or config" };
  if (zone === "red") return { ok: false, reason: "RED zone: core security / side-effect code" };
  if (zone === "outside") return { ok: false, reason: /\.(ts|tsx|css)$/.test(path) ? "outside editable scope" : "file type not editable" };
  if (creating) return { ok: false, reason: "new files only under tests/asi/" };
  return { ok: true, path, zone };
}

export function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + needle.length)) count += 1;
  return count;
}

/** Content rules for a changed app file: no new dangerous tokens, no wholesale rewrite. */
export function scanContent(path, before, after, zone) {
  const problems = [];
  const limits = LIMITS[zone === "yellow" ? "restricted" : "open"];
  if (!after.trim()) problems.push("file would become empty");
  if (before.length > 1_000) {
    if (after.length < before.length * (1 - limits.maxShrink)) problems.push(`shrinks ${Math.round((1 - after.length / before.length) * 100)}% (limit ${Math.round(limits.maxShrink * 100)}%)`);
    if (after.length > before.length * (1 + limits.maxGrowth) + 2_000) problems.push(`grows ${Math.round((after.length / before.length - 1) * 100)}% (limit ${Math.round(limits.maxGrowth * 100)}%)`);
  }
  if (!/\.css$/.test(path)) {
    for (const [name, pattern] of FORBIDDEN_CONTENT) {
      const was = (before.match(pattern) || []).length;
      const now = (after.match(pattern) || []).length;
      if (now > was) problems.push(`adds ${name} (${was} → ${now})`);
    }
  } else if ((after.match(/url\(\s*["']?https?:/g) || []).length > (before.match(/url\(\s*["']?https?:/g) || []).length) {
    problems.push("adds a remote url() in CSS");
  }
  return problems;
}

/**
 * Apply a proposal `{ edits: [{path, search, replace}], newFiles: [{path, content}] }`
 * against `readFile(relPath) -> string | null`. Pure: returns new contents, writes nothing.
 */
export function applyProposal(proposal, readFile, policy) {
  const errors = [];
  const changed = new Map();
  const created = new Set();
  const zones = new Map();
  const originals = new Map();
  const editsPerFile = new Map();
  const edits = Array.isArray(proposal?.edits) ? proposal.edits : [];
  const newFiles = Array.isArray(proposal?.newFiles) ? proposal.newFiles : [];
  if (!edits.length && !newFiles.length) errors.push("proposal has no edits");
  if (edits.length > MAX_EDITS) errors.push(`too many edits (${edits.length} > ${MAX_EDITS})`);
  if (newFiles.length > MAX_NEW_FILES) errors.push(`too many new files (${newFiles.length} > ${MAX_NEW_FILES})`);
  if (errors.length) return { ok: false, errors, changed, created };

  for (const [index, edit] of edits.entries()) {
    const check = checkEditPath(edit?.path, policy);
    if (!check.ok) { errors.push(`edit ${index + 1} (${edit?.path}): ${check.reason}`); continue; }
    if (typeof edit.search !== "string" || !edit.search || typeof edit.replace !== "string") { errors.push(`edit ${index + 1} (${check.path}): search/replace must be non-empty strings`); continue; }
    const limits = LIMITS[check.zone === "yellow" ? "restricted" : "open"];
    if (edit.replace.length > limits.replaceChars) { errors.push(`edit ${index + 1} (${check.path}): replacement too large for ${check.zone} zone (${edit.replace.length} > ${limits.replaceChars})`); continue; }
    const n = (editsPerFile.get(check.path) || 0) + 1;
    editsPerFile.set(check.path, n);
    if (n > limits.editsPerFile) { errors.push(`edit ${index + 1} (${check.path}): more than ${limits.editsPerFile} edits in one ${check.zone}-zone file`); continue; }
    const current = changed.has(check.path) ? changed.get(check.path) : readFile(check.path);
    if (current == null) { errors.push(`edit ${index + 1} (${check.path}): file does not exist`); continue; }
    if (!originals.has(check.path)) originals.set(check.path, current);
    const count = countOccurrences(current, edit.search);
    if (count !== 1) { errors.push(`edit ${index + 1} (${check.path}): search text matched ${count} times (must be exactly 1)`); continue; }
    const at = current.indexOf(edit.search);
    changed.set(check.path, current.slice(0, at) + edit.replace + current.slice(at + edit.search.length));
    zones.set(check.path, check.zone);
  }

  for (const [path, after] of changed) {
    for (const problem of scanContent(path, originals.get(path), after, zones.get(path))) errors.push(`${path}: ${problem}`);
  }

  for (const [index, file] of newFiles.entries()) {
    const check = checkEditPath(file?.path, policy, { creating: true });
    if (!check.ok) { errors.push(`new file ${index + 1} (${file?.path}): ${check.reason}`); continue; }
    if (typeof file.content !== "string" || !file.content.trim()) { errors.push(`new file ${index + 1} (${check.path}): empty content`); continue; }
    if (file.content.length > MAX_NEW_FILE_CHARS) { errors.push(`new file ${index + 1} (${check.path}): too large`); continue; }
    if (readFile(check.path) != null || changed.has(check.path)) { errors.push(`new file ${index + 1} (${check.path}): already exists`); continue; }
    if (/child_process|["']node:fs["']|["']fs["']|process\.env|https?:\/\/(?!127\.0\.0\.1|localhost)/.test(file.content)) { errors.push(`new file ${index + 1} (${check.path}): tests may not touch fs, child_process, env or the network`); continue; }
    changed.set(check.path, file.content);
    created.add(check.path);
  }

  return { ok: errors.length === 0, errors, changed, created };
}
