import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Export tracked tree → release/userward-community-v0.1.0 for the public repo.
 *
 * PUBLIC (ship): scripts/asi/*, build-userward.ps1, start-userward.ps1,
 *   open-userward.ps1, clean-dist, build-community, check-public, measure-*,
 *   run-benchmark-fixtures, run-quality-70, smoke-model-first-interview,
 *   userward-port, export-community itself.
 *
 * PRIVATE (never ship here — keep on userward-personal only):
 *   scripts/debug-ssr.mjs, scripts/debug-stream.mjs
 *   BUSINESS REQUIREMENTS DOCUMENT v2.md
 *   personal connectors / RPA / .env (see docs/PERSONAL.md)
 */
const root = process.cwd();
const destination = join(root, "release", "userward-community-v0.1.0");
const excluded = new Set([
  "BUSINESS REQUIREMENTS DOCUMENT v2.md",
  "scripts/debug-ssr.mjs",
  "scripts/debug-stream.mjs",
  "docs/PERSONAL.md",
]);

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
for (const file of files) {
  if (excluded.has(file)) continue;
  const target = join(destination, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(root, file), target);
}

console.log(`Community source exported to ${destination}`);
console.log(`Excluded private paths: ${[...excluded].join(", ")}`);
