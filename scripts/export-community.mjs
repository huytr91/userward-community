import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const destination = join(root, "release", "userward-community-v0.1.0");
const excluded = new Set([
  "BUSINESS REQUIREMENTS DOCUMENT v2.md",
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

writeFileSync(join(destination, ".openai", "hosting.json"), JSON.stringify({ project_id: null, d1: null, r2: null }, null, 2) + "\n");
console.log(`Community source exported to ${destination}`);
