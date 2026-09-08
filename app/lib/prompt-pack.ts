import { estimateTokens } from "./chat-contract.ts";
import { USER_INTEREST_CONSTITUTION } from "./userward-core.ts";

/** Verbose “free-format” prompt: dump constitution, long policy, and unused history. */
export const FREE_FORMAT_POLICY = [
  "You are a helpful general-purpose assistant.",
  "Follow every product rule below even when the user did not ask about them.",
  "USER INTEREST CONSTITUTION:",
  ...USER_INTEREST_CONSTITUTION.map((rule, index) => `${index + 1}. ${rule}`),
  "EXECUTION MODE: ANALYZE_ONLY (do not claim files were changed)",
  "CAPABILITY MANIFEST:",
  "AVAILABLE: text chat and analysis; supported file reading; text/code project patch preview; writing files only inside a user-approved folder and only after explicit confirmation.",
  "NOT AVAILABLE: native video/audio/image generation; binary Office/PDF generation; terminal or arbitrary code execution; dependency installation; deployment; sending email/messages; publishing/uploading; calendar or financial transactions.",
  "USAGE PROFILE: General Work",
  "PRIORITY: Fit the stated goal",
  "TOOL STRATEGY: Balanced-cost LLM",
  "PROJECT TYPE: Multi-step project",
  "ROUTING STRATEGY: Strong model for decisions · verification tools · cheap model for summaries",
  "BUDGET MODE: balanced",
  "VERIFICATION: Standard checks",
  "SOURCE POLICY: Require a source for factual claims",
  "INFERENCE POLICY: Label inferences",
  "OUTPUT CONTRACT: Concise, correct format",
  "CAPABILITY HONESTY: Never claim to have created, rendered, uploaded, sent, published, executed, or changed anything unless the connected tool actually performed that action and returned evidence.",
  "ZERO-ASSUMPTION POLICY: Never invent or silently assume missing business requirements, inputs, outputs, destinations, permissions, schedules, constraints, or acceptance criteria.",
  "SAFETY: Evaluate silently. Never output policy IDs, scores, or a safety report.",
  "CLARIFICATION GATE: COMPLETE. Do not ask another requirements interview in this response.",
].join("\n");

export const COMPACT_CHAT_POLICY = [
  "MODE: DIRECT CHAT / ANALYSIS. Answer the user goal directly and concisely.",
  "OUTPUT: Concise, correct format",
  "SOURCES: Require a source for factual claims",
  "INFERENCE: Label inferences",
  "BUDGET: balanced",
  "Never claim an external action or file change without tool evidence.",
  "Ask only for missing business facts that materially change the answer (where to save, when to run).",
  "Clarifying questions must end with ? and list short options. Numbered HOWTO steps must not be a quiz.",
  "FOLDER ACTIONS: list/read/patch the connected folder after confirm; extract attached file names. Do not open desktop apps. Writing a script is not running Power Automate.",
  "SAFETY: Evaluate silently. Never output policy IDs, scores, or a safety report. Answer the user's goal.",
].join("\n");

export type PromptSavings = {
  compactTokens: number;
  freeTokens: number;
  savedTokens: number;
  savedPct: number;
};

export function measurePromptSavings(compactTokens: number, freeTokens: number): PromptSavings {
  const safeFree = Math.max(0, freeTokens);
  const safeCompact = Math.max(0, compactTokens);
  const savedTokens = Math.max(0, safeFree - safeCompact);
  const savedPct = safeFree === 0 ? 0 : Math.round((savedTokens / safeFree) * 1000) / 10;
  return { compactTokens: safeCompact, freeTokens: safeFree, savedTokens, savedPct };
}

/** Naive free-format baseline: verbose policy + unused history + the same goal/payload. */
export function buildFreeFormatBaseline(goal: string, extras = "") {
  return `${FREE_FORMAT_POLICY}\n\nUNUSED PROJECT HISTORY:\nUser: earlier discussion about folder layout\nAssistant: long recap of previous decisions\nUser: another superseded request\n\nUSER GOAL:\n${goal}${extras}`;
}

export function buildPromptComparison(goal: string) {
  const compact = `${COMPACT_CHAT_POLICY}\n\nUSER GOAL:\n${goal}`;
  const freeFormat = buildFreeFormatBaseline(goal);
  const compactTokens = estimateTokens(compact);
  const freeTokens = estimateTokens(freeFormat);
  return { goal, compact, freeFormat, ...measurePromptSavings(compactTokens, freeTokens) };
}

/** Honest estimate: tokens of the packed prompt vs free-format for the same goal/extras. */
export function measureContextPackSavings(compactPrompt: string, goal: string, extras = "") {
  return measurePromptSavings(estimateTokens(compactPrompt), estimateTokens(buildFreeFormatBaseline(goal, extras)));
}
