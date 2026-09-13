import type { InterviewGate } from "./interview-ontology.ts";
import type { InterviewQuestion } from "./interview-pipeline.ts";
import { isInterviewSlotFilled } from "./interview-pipeline.ts";
import type { PersonalPackState } from "./personal-interview-pack.ts";

/** Versioned inspectable brief after clarify-before-generate. Independent of model output. */
export const CLEAR_BRIEF_VERSION = 1 as const;

export type SlotSource = "user" | "inferred" | "suggested_pack";
export type SlotConfidence = "high" | "medium" | "low";

export type ClearBriefSlot = {
  id: string;
  label: string;
  value: string;
  source: SlotSource;
  confidence: SlotConfidence;
};

export type ClearBrief = {
  version: typeof CLEAR_BRIEF_VERSION;
  id: string;
  createdAt: string;
  goal: string;
  gate: InterviewGate;
  intentFamily?: string | null;
  slots: ClearBriefSlot[];
  notes?: string;
  /** Soft assumptions stated for generate — never invented side-effect facts. */
  assumptions: string[];
};

function slotSource(input: {
  slotId: string;
  value: string;
  intentFamily?: string | null;
  personalPack?: PersonalPackState;
}): SlotSource {
  const intent = input.intentFamily || "";
  const pack = input.personalPack;
  if (!pack?.enabled || !intent) return "user";
  const hit = pack.entries.some(
    entry =>
      entry.intent === intent &&
      entry.slotId === input.slotId &&
      entry.value.trim().toLowerCase() === input.value.trim().toLowerCase() &&
      entry.count >= 3,
  );
  return hit ? "suggested_pack" : "user";
}

function slotConfidence(source: SlotSource, value: string): SlotConfidence {
  if (source === "inferred") return "low";
  if (source === "suggested_pack") return "medium";
  return value.trim().length >= 12 ? "high" : "medium";
}

export function buildClearBrief(input: {
  goal: string;
  questions: InterviewQuestion[];
  answers: Record<string, string>;
  notes?: string;
  gate?: InterviewGate;
  intentFamily?: string | null;
  personalPack?: PersonalPackState;
  assumptions?: string[];
  now?: Date;
  id?: string;
}): ClearBrief {
  const created = input.now ?? new Date();
  const slots: ClearBriefSlot[] = input.questions
    .filter(question => isInterviewSlotFilled(input.answers[question.id]))
    .map(question => {
      const value = input.answers[question.id].trim();
      const source = slotSource({
        slotId: question.id,
        value,
        intentFamily: input.intentFamily,
        personalPack: input.personalPack,
      });
      return {
        id: question.id,
        label: question.label,
        value,
        source,
        confidence: slotConfidence(source, value),
      };
    });

  const notes = input.notes?.trim() || undefined;
  return {
    version: CLEAR_BRIEF_VERSION,
    id: input.id || `brief-${created.getTime()}`,
    createdAt: created.toISOString(),
    goal: input.goal.trim(),
    gate: input.gate || "soft",
    intentFamily: input.intentFamily ?? null,
    slots,
    ...(notes ? { notes } : {}),
    assumptions: (input.assumptions || []).map(item => item.trim()).filter(Boolean),
  };
}

/** Canonical JSON for export / audit / replay fixtures. */
export function serializeClearBrief(brief: ClearBrief): string {
  return JSON.stringify(brief, null, 2);
}

export function parseClearBrief(raw: string): ClearBrief | null {
  try {
    const parsed = JSON.parse(raw) as ClearBrief;
    if (parsed?.version !== CLEAR_BRIEF_VERSION || typeof parsed.goal !== "string" || !Array.isArray(parsed.slots)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Short human summary for timeline / receipt (not a substitute for JSON export). */
export function summarizeClearBrief(brief: ClearBrief): string {
  const slotLine = brief.slots.map(slot => `${slot.label}: ${slot.value}`).join(" · ");
  const gate = brief.gate !== "none" ? `gate=${brief.gate}` : "";
  const family = brief.intentFamily ? `intent=${brief.intentFamily}` : "";
  return [gate, family, slotLine].filter(Boolean).join(" · ");
}
