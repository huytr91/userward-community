import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
const forbiddenPaths = [/^\.env(?!\.example$)/, /\.pem$/i, /\.p12$/i, /\.pfx$/i, /\.tar\.gz$/i, /^dist\//, /^node_modules\//];
const secretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /art_v2_[A-Za-z0-9_-]+/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const failures = [];
for (const file of files) {
  if (forbiddenPaths.some(pattern => pattern.test(file))) failures.push(`forbidden tracked path: ${file}`);
  if (file === "scripts/check-public.mjs") continue;
  if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(file)) continue;
  const body = readFileSync(file, "utf8");
  for (const pattern of secretPatterns) if (pattern.test(body)) failures.push(`possible secret in ${file}: ${pattern}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Public-source guard passed (${files.length} tracked files scanned).`);
