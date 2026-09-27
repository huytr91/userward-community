/**
 * Offline fixture harness: build Clear Briefs, estimate packed vs free-format tokens,
 * emit ChatGPT judge packs (blind A/B placeholders). No provider calls; no secrets.
 *
 * Usage:
 *   node --experimental-strip-types scripts/run-benchmark-fixtures.mjs
 *   npm run bench:fixtures
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildClearBrief,
  confirmClearBrief,
  formatClearBriefForPrompt,
  serializeClearBrief,
  validateClearBriefForGenerate,
} from "../app/lib/clear-brief.ts";
import { COMPACT_CHAT_POLICY, measureContextPackSavings } from "../app/lib/prompt-pack.ts";

const root = process.cwd();
const fixturesDir = join(root, "benchmarks", "fixtures");
const outDir = join(root, "benchmarks", "out");
const briefsDir = join(outDir, "briefs");
const packsDir = join(outDir, "judge-packs");

function loadFixtures() {
  return readdirSync(fixturesDir)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => {
      const raw = JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
      return { ...raw, file: name };
    });
}

function buildPackedPrompt(fixture, brief) {
  const extras = fixture.contextExtras ? `\n\n${fixture.contextExtras}` : "";
  const briefBlock = formatClearBriefForPrompt(brief);
  return `${COMPACT_CHAT_POLICY}\n\n${briefBlock}\n\nUSER GOAL:\n${fixture.goal}${extras}`;
}

function buildNaiveExtras(fixture) {
  const extras = fixture.contextExtras ? `\n\n${fixture.contextExtras}` : "";
  const fluff = fixture.contextExtras
    ? `\n\n--- UNUSED WORKSPACE FILE: notes-old.md ---\n${"Superseded notes that a naive dump would still send. ".repeat(20)}`
    : "";
  return `${extras}${fluff}`;
}

function runFixture(fixture) {
  const brief = buildClearBrief({
    goal: fixture.goal,
    questions: fixture.questions || [],
    answers: fixture.answers || {},
    notes: fixture.notes,
    gate: fixture.expectedGate,
    intentFamily: fixture.expectedFamily,
    lane: fixture.lane,
    status: "draft",
    id: `brief-${fixture.id}`,
    now: new Date("2026-09-16T12:00:00.000Z"),
  });
  const validation = validateClearBriefForGenerate(brief);
  const expectBlocked = Boolean(fixture.expectGenerateBlocked);
  const protocolOk = expectBlocked ? !validation.ok : validation.ok;
  const confirmed = validation.ok ? confirmClearBrief(brief) : brief;
  const packed = buildPackedPrompt(fixture, confirmed);
  const savings = measureContextPackSavings(packed, fixture.goal, buildNaiveExtras(fixture));

  return {
    id: fixture.id,
    domain: fixture.domain,
    locale: fixture.locale,
    expectedGate: fixture.expectedGate,
    expectedFamily: fixture.expectedFamily,
    lane: fixture.lane,
    expectGenerateBlocked: expectBlocked,
    protocolOk,
    validation,
    briefStatus: confirmed.status,
    missingRequired: confirmed.missingRequired,
    assumptionCount: confirmed.assumptions.length,
    slotCount: confirmed.slots.length,
    savings,
    brief: confirmed,
    packedPromptChars: packed.length,
  };
}

function blindMap(id) {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % 2;
  return hash === 0
    ? { a: "userward", b: "naive", aTitle: "OUTPUT_A", bTitle: "OUTPUT_B" }
    : { a: "naive", b: "userward", aTitle: "OUTPUT_A", bTitle: "OUTPUT_B" };
}

function judgePackMarkdown(fixture, result) {
  const labels = blindMap(fixture.id);

  return `# Judge pack — ${fixture.id}

Paste this whole file into ChatGPT (or another judge). Do **not** tell the judge which system produced A or B until after scoring.

## Rubric
Use \`benchmarks/CHATGPT_RUBRIC.md\`. Score each criterion 1–5. Prefer evidence quotes.

## Task
- **Goal:** ${fixture.goal}
- **Domain / gate / family:** ${fixture.domain} / ${fixture.expectedGate} / ${fixture.expectedFamily}
- **Locale:** ${fixture.locale}
- **Protocol note:** expectGenerateBlocked=${Boolean(fixture.expectGenerateBlocked)}; validation.ok=${result.validation.ok}

## Confirmed / draft Clear Brief (JSON)
\`\`\`json
${serializeClearBrief(result.brief)}
\`\`\`

## Judge focus
${(fixture.judgeFocus || []).map(item => `- ${item}`).join("\n") || "- (none)"}

## Forbidden claims
${(fixture.forbiddenInOutput || []).map(item => `- ${item}`).join("\n") || "- (none)"}

## Blind outputs
Replace the placeholders with real model answers (same goal). Keep labels A/B only.

### ${labels.aTitle}
\`\`\`
<<PASTE_${labels.a.toUpperCase()}_OUTPUT_HERE>>
\`\`\`

### ${labels.bTitle}
\`\`\`
<<PASTE_${labels.b.toUpperCase()}_OUTPUT_HERE>>
\`\`\`

## Mapping (keep private until after the judge scores)
- OUTPUT_A was produced as: **${labels.a}**
- OUTPUT_B was produced as: **${labels.b}**

## Offline token estimate (not a ChatGPT UI comparison)
- packedTokens≈${result.savings.compactTokens}
- freeFormatTokens≈${result.savings.freeTokens}
- savedPct≈${result.savings.savedPct}%
`;
}

mkdirSync(briefsDir, { recursive: true });
mkdirSync(packsDir, { recursive: true });

const fixtures = loadFixtures();
const rows = fixtures.map(runFixture);

for (const result of rows) {
  writeFileSync(join(briefsDir, `${result.id}.json`), serializeClearBrief(result.brief));
}
for (const fixture of fixtures) {
  const result = rows.find(row => row.id === fixture.id);
  writeFileSync(join(packsDir, `${fixture.id}.md`), judgePackMarkdown(fixture, result));
}

const summary = {
  generatedAt: new Date().toISOString(),
  fixtureCount: rows.length,
  protocolFailures: rows.filter(row => !row.protocolOk).map(row => row.id),
  aggregateSavings: {
    compactTokens: rows.reduce((n, row) => n + row.savings.compactTokens, 0),
    freeTokens: rows.reduce((n, row) => n + row.savings.freeTokens, 0),
    savedTokens: rows.reduce((n, row) => n + row.savings.savedTokens, 0),
    savedPct:
      rows.reduce((n, row) => n + row.savings.freeTokens, 0) === 0
        ? 0
        : Math.round(
            (rows.reduce((n, row) => n + row.savings.savedTokens, 0) /
              rows.reduce((n, row) => n + row.savings.freeTokens, 0)) *
              1000,
          ) / 10,
  },
  rows: rows.map(({ brief, ...rest }) => rest),
};

writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

const failed = summary.protocolFailures;
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      fixtures: summary.fixtureCount,
      protocolFailures: failed,
      aggregateSavedPct: summary.aggregateSavings.savedPct,
      out: "benchmarks/out/",
    },
    null,
    2,
  ),
);
if (failed.length) process.exitCode = 1;
