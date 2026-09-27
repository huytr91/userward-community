import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildClearBrief, validateClearBriefForGenerate } from "../app/lib/clear-brief.ts";

const fixturesDir = join(process.cwd(), "benchmarks", "fixtures");

test("benchmark fixtures are valid and protocol expectations hold", () => {
  const files = readdirSync(fixturesDir).filter(name => name.endsWith(".json"));
  assert.ok(files.length >= 8);
  for (const name of files) {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
    assert.ok(fixture.id && fixture.goal && fixture.expectedGate);
    const brief = buildClearBrief({
      goal: fixture.goal,
      questions: fixture.questions || [],
      answers: fixture.answers || {},
      notes: fixture.notes,
      gate: fixture.expectedGate,
      intentFamily: fixture.expectedFamily,
      lane: fixture.lane,
      id: `brief-${fixture.id}`,
    });
    const check = validateClearBriefForGenerate(brief);
    if (fixture.expectGenerateBlocked) assert.equal(check.ok, false, name);
    else assert.equal(check.ok, true, name);
  }
});
