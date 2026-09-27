import { HARD_SLOT_IDS, type InterviewGate } from "./interview-ontology.ts";
import {
  isInterviewAnswerClear,
  isInterviewSlotFilled,
  type InterviewLane,
  type InterviewQuestion,
} from "./interview-pipeline.ts";
import { PERSONAL_PACK_MIN_COUNT, type PersonalPackState } from "./personal-interview-pack.ts";

/** Versioned inspectable brief after clarify-before-generate. Independent of model output. */
export const CLEAR_BRIEF_VERSION = 2 as const;

export type SlotSource = "user" | "inferred" | "suggested_pack";
export type SlotConfidence = "high" | "medium" | "low";
export type ClearBriefStatus = "draft" | "confirmed";

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
  lane?: InterviewLane | string;
  slots: ClearBriefSlot[];
  /** Hard / asked slots still missing — must be empty before hard-gate generate. */
  missingRequired: string[];
  notes?: string;
  /** Soft assumptions allowed for generate — never invented side-effect facts. */
  assumptions: string[];
  status: ClearBriefStatus;
  confirmedAt?: string;
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
      entry.count >= PERSONAL_PACK_MIN_COUNT,
  );
  return hit ? "suggested_pack" : "user";
}

/** Confidence from CLEAR clarity + provenance — not raw string length. */
export function slotConfidence(source: SlotSource, value: string, options?: string[]): SlotConfidence {
  if (source === "inferred") return "low";
  if (!isInterviewAnswerClear(value, options)) return "low";
  if (source === "suggested_pack") return "medium";
  return "high";
}

/** Slots that must be filled before generate (hard gate + asked hard ids). */
export function requiredSlotIdsForBrief(input: {
  gate?: InterviewGate;
  askedSlotIds: string[];
  allowedSlotIds?: string[];
}): string[] {
  const asked = new Set(input.askedSlotIds);
  const allowed = input.allowedSlotIds?.length ? new Set(input.allowedSlotIds) : null;
  const hardAsked = [...HARD_SLOT_IDS].filter(id => asked.has(id) && (!allowed || allowed.has(id)));
  if (input.gate === "hard") return hardAsked.length ? hardAsked : [...asked];
  return [];
}

export function missingRequiredSlotIds(input: {
  requiredSlotIds: string[];
  answers: Record<string, string>;
  optionsBySlot?: Record<string, string[]>;
}): string[] {
  return input.requiredSlotIds.filter(id => {
    const options = input.optionsBySlot?.[id];
    return !isInterviewSlotFilled(input.answers[id]) || !isInterviewAnswerClear(input.answers[id], options);
  });
}

/** Soft-gate defaults when a meta slot was never confirmed. */
export function defaultSoftAssumptions(input: {
  gate?: InterviewGate;
  askedSlotIds: string[];
  lane?: InterviewLane | string;
}): string[] {
  const assumptions: string[] = [];
  if (input.lane === "passthrough") {
    assumptions.push("Passthrough: interview exhausted; generate from the goal as written with labeled soft assumptions only — no invented paths, schedules, or overwrite.");
  }
  if (input.gate === "soft") {
    const asked = new Set(input.askedSlotIds);
    if (!asked.has("timeframe") && !asked.has("constraints")) {
      assumptions.push("Timeframe/constraints not locked in the brief; keep ranges qualitative unless the goal states them.");
    }
    if (!asked.has("audience") && !asked.has("output_shape")) {
      assumptions.push("Audience/output shape not locked; prefer a concise practical draft over a refuse.");
    }
  }
  return assumptions;
}

export function buildClearBrief(input: {
  goal: string;
  questions: InterviewQuestion[];
  answers: Record<string, string>;
  notes?: string;
  gate?: InterviewGate;
  intentFamily?: string | null;
  lane?: InterviewLane | string;
  allowedSlotIds?: string[];
  personalPack?: PersonalPackState;
  assumptions?: string[];
  status?: ClearBriefStatus;
  now?: Date;
  id?: string;
}): ClearBrief {
  const created = input.now ?? new Date();
  const askedSlotIds = input.questions.map(question => question.id);
  const requiredSlotIds = requiredSlotIdsForBrief({
    gate: input.gate,
    askedSlotIds,
    allowedSlotIds: input.allowedSlotIds,
  });
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
        confidence: slotConfidence(source, value, question.options),
      };
    });

  const notes = input.notes?.trim() || undefined;
  const autoAssumptions = defaultSoftAssumptions({
    gate: input.gate,
    askedSlotIds,
    lane: input.lane,
  });
  const assumptions = [...autoAssumptions, ...(input.assumptions || [])]
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);

  const optionsBySlot = Object.fromEntries(input.questions.map(question => [question.id, question.options]));
  return {
    version: CLEAR_BRIEF_VERSION,
    id: input.id || `brief-${created.getTime()}`,
    createdAt: created.toISOString(),
    goal: input.goal.trim(),
    gate: input.gate || "soft",
    intentFamily: input.intentFamily ?? null,
    ...(input.lane ? { lane: input.lane } : {}),
    slots,
    missingRequired: missingRequiredSlotIds({ requiredSlotIds, answers: input.answers, optionsBySlot }),
    ...(notes ? { notes } : {}),
    assumptions,
    status: input.status || "draft",
  };
}

export function updateClearBriefSlot(brief: ClearBrief, slotId: string, value: string): ClearBrief {
  const nextValue = value.trim();
  const slots = brief.slots.map(slot => {
    if (slot.id !== slotId) return slot;
    const source: SlotSource = slot.source === "suggested_pack" ? "user" : slot.source;
    return {
      ...slot,
      value: nextValue,
      source,
      confidence: slotConfidence(source, nextValue),
    };
  });
  const askedSlotIds = [...new Set([...slots.map(slot => slot.id), ...brief.missingRequired, slotId])];
  const answers: Record<string, string> = Object.fromEntries(slots.map(slot => [slot.id, slot.value]));
  for (const id of askedSlotIds) {
    if (!(id in answers)) answers[id] = "";
  }
  const requiredSlotIds = requiredSlotIdsForBrief({
    gate: brief.gate,
    askedSlotIds,
  });
  return {
    ...brief,
    slots,
    missingRequired: missingRequiredSlotIds({ requiredSlotIds, answers }),
    status: "draft",
    confirmedAt: undefined,
  };
}

export function updateClearBriefAssumptions(brief: ClearBrief, assumptionsText: string): ClearBrief {
  const assumptions = assumptionsText
    .split(/\n+/)
    .map(item => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return { ...brief, assumptions, status: "draft", confirmedAt: undefined };
}

export function validateClearBriefForGenerate(brief: ClearBrief): { ok: boolean; missing: string[] } {
  const missing = [...brief.missingRequired];
  if (brief.gate === "hard") {
    for (const slot of brief.slots) {
      if (HARD_SLOT_IDS.has(slot.id) && (!isInterviewSlotFilled(slot.value) || !isInterviewAnswerClear(slot.value) || slot.confidence === "low")) {
        if (!missing.includes(slot.id)) missing.push(slot.id);
      }
    }
  }
  return { ok: missing.length === 0, missing };
}

export function confirmClearBrief(brief: ClearBrief, now = new Date()): ClearBrief {
  const check = validateClearBriefForGenerate(brief);
  if (!check.ok) return { ...brief, missingRequired: check.missing, status: "draft" };
  return {
    ...brief,
    missingRequired: [],
    status: "confirmed",
    confirmedAt: now.toISOString(),
  };
}

/** Structured block for the generate prompt — the brief is the source of truth. */
export function formatClearBriefForPrompt(brief: ClearBrief): string {
  return [
    "CLEAR_BRIEF_JSON:",
    serializeClearBrief(brief),
    "Treat CLEAR_BRIEF_JSON as the confirmed brief. Do not invent side-effect facts (paths, schedules, overwrite) outside it.",
    "Use listed assumptions only when soft and label them; prefer the draft over refusing.",
  ].join("\n");
}

/** Canonical JSON for export / audit / replay fixtures. */
export function serializeClearBrief(brief: ClearBrief): string {
  return JSON.stringify(brief, null, 2);
}

export function parseClearBrief(raw: string): ClearBrief | null {
  try {
    const parsed = JSON.parse(raw) as ClearBrief & { version?: number };
    if ((parsed?.version !== 1 && parsed?.version !== CLEAR_BRIEF_VERSION) || typeof parsed.goal !== "string" || !Array.isArray(parsed.slots)) {
      return null;
    }
    return {
      version: CLEAR_BRIEF_VERSION,
      id: typeof parsed.id === "string" ? parsed.id : `brief-${Date.now()}`,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      goal: parsed.goal,
      gate: parsed.gate || "soft",
      intentFamily: parsed.intentFamily ?? null,
      ...(parsed.lane ? { lane: parsed.lane } : {}),
      slots: parsed.slots,
      missingRequired: Array.isArray(parsed.missingRequired) ? parsed.missingRequired : [],
      ...(parsed.notes ? { notes: parsed.notes } : {}),
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
      status: parsed.status === "confirmed" ? "confirmed" : "draft",
      ...(parsed.confirmedAt ? { confirmedAt: parsed.confirmedAt } : {}),
    };
  } catch {
    return null;
  }
}

/** Short human summary for timeline / receipt (not a substitute for JSON export). */
export function summarizeClearBrief(brief: ClearBrief): string {
  const slotLine = brief.slots.map(slot => `${slot.label}: ${slot.value}`).join(" · ");
  const gate = brief.gate !== "none" ? `gate=${brief.gate}` : "";
  const family = brief.intentFamily ? `intent=${brief.intentFamily}` : "";
  const status = brief.status ? `status=${brief.status}` : "";
  return [status, gate, family, slotLine].filter(Boolean).join(" · ");
}
