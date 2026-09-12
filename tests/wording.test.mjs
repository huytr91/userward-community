import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|css)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test("UI source contains no common broken-encoding sequences", async () => {
  const files = await sourceFiles("app");
  const broken = /\uFFFD|Ã[^\s]|â(?:€|™|œ|ž)|Ä[‘’]|Æ[°±]/u;
  const failures = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (broken.test(text)) failures.push(file);
  }
  assert.deepEqual(failures, []);
});

test("UI uses an explicit Vietnamese-safe font fallback", async () => {
  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /--font-ui:"Segoe UI"/);
  assert.match(css, /Arial,sans-serif/);
});
