/**
 * Offline Quality-70 runner.
 * Usage: node --experimental-strip-types scripts/run-quality-70.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scoreQualityCase, summarizeScores } from "../app/lib/quality-benchmark.ts";

const root = process.cwd();
const casesPath = join(root, "benchmarks", "quality-70", "cases.json");
const outDir = join(root, "benchmarks", "out");
const publicDir = join(root, "benchmarks", "public");
mkdirSync(outDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const cases = JSON.parse(readFileSync(casesPath, "utf8"));
const scores = cases.map(scoreQualityCase);
const summary = summarizeScores(scores, 0.9);

const payload = {
  generatedAt: new Date().toISOString(),
  measured: [
    "Routing: ordinary Q&A must not open actionable Clear Brief (isActionableGoal=false)",
    "Web: needsWebContext only for live/current asks",
    "Token: compact ORDINARY policy vs free-format dump (≥25% saved)",
    "Continuity (§7): packed clipped history ≤55% of naive full-history dump",
  ],
  summary,
  scores,
};

writeFileSync(join(outDir, "quality-70-summary.json"), JSON.stringify(payload, null, 2));

const md = `# Quality-70 results

Generated: ${payload.generatedAt}

## What we measure
${payload.measured.map(item => `- ${item}`).join("\n")}

## Summary
- **Cases:** ${summary.total}
- **Passed:** ${summary.passed}
- **Failed:** ${summary.failed}
- **Pass rate:** ${summary.passRate}%
- **Avg token saved vs free-format:** ${summary.avgSavedPct}%
- **Suite OK (≥90%):** ${summary.ok ? "YES" : "NO"}

## By category
${Object.entries(summary.byCategory).map(([name, row]) => `- **${name}:** ${row.passed}/${row.total}`).join("\n")}

## Failed IDs
${summary.failedIds.length ? summary.failedIds.map(id => `- ${id}`).join("\n") : "_None_"}

## Notes
Offline policy/routing/token packing only — not a live LLM answer bake-off.
`;

writeFileSync(join(publicDir, "QUALITY_70_RESULTS.md"), md);
writeFileSync(join(outDir, "quality-70-results.md"), md);

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
