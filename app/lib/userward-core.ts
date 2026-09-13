export type ExecutionMode = "analyze" | "execute";
export type QualityTarget = "draft" | "standard" | "verified";
export type PrivacyLevel = "local" | "provider_allowed" | "restricted";

export const USER_INTEREST_CONSTITUTION = [
  "Use a deterministic tool instead of a model when it is sufficient.",
  "Choose the least expensive qualified route; never silently upgrade free to paid.",
  "Send only the minimum necessary context and disclose what leaves the device.",
  "Perform no side effect without explicit, action-scoped approval.",
  "Make no completion claim without execution evidence.",
  "Do not invent or silently assume missing business requirements; ask until slots that change the result are confirmed.",
  "If a material fact is unknown, interview the user; never invent unverified content.",
  "Disclose the actual model, tool, cost, fallback, and failure.",
  "Never turn weak retrieval into a legal conclusion.",
  "Do not ask users to make technical decisions the manager can safely make.",
  "Route without provider commission or commercial preference.",
] as const;

export type BudgetPolicy = {
  mode: "free-first" | "economy" | "balanced" | "quality";
  allowPaidUpgrade: boolean;
  maxRetries: number;
};

export type GoalContract = {
  objective: string;
  deliverables: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  allowedActions: string[];
  forbiddenActions: string[];
  privacyLevel: PrivacyLevel;
  qualityTarget: QualityTarget;
  budget: BudgetPolicy;
};

export type CapabilityProfile = {
  id: string;
  type: "model" | "tool";
  available: boolean;
  deterministic: boolean;
  capabilities: string[];
  evidenceRequired: boolean;
};

export const COMMUNITY_CAPABILITY_REGISTRY: CapabilityProfile[] = [
  { id: "local-file-parser", type: "tool", available: true, deterministic: true, capabilities: ["read-text", "read-office", "read-csv"], evidenceRequired: false },
  { id: "folder-patch", type: "tool", available: true, deterministic: true, capabilities: ["create-code", "update-code"], evidenceRequired: true },
  { id: "connected-llm", type: "model", available: true, deterministic: false, capabilities: ["chat", "analysis", "coding", "structured-output"], evidenceRequired: false },
  { id: "local-hands", type: "tool", available: true, deterministic: true, capabilities: ["workspace-list", "workspace-read", "workspace-patch", "file-extract"], evidenceRequired: true },
  { id: "desktop-rpa", type: "tool", available: false, deterministic: true, capabilities: ["desktop-ui-click"], evidenceRequired: true },
  { id: "terminal-runtime", type: "tool", available: false, deterministic: true, capabilities: ["run-code", "test", "install"], evidenceRequired: true },
  { id: "media-renderer", type: "tool", available: false, deterministic: true, capabilities: ["render-video", "generate-audio", "generate-image"], evidenceRequired: true },
  { id: "external-actions", type: "tool", available: false, deterministic: true, capabilities: ["email", "publish", "deploy", "transaction"], evidenceRequired: true },
];

export function createGoalContract(input: {
  objective: string;
  executionMode: ExecutionMode;
  hasFolder: boolean;
  hasAttachments: boolean;
  freeEligible: boolean;
  budgetMode: "economy" | "balanced" | "quality";
}): GoalContract {
  const objective = input.objective.trim() || "Analyze the attached material";
  return {
    objective,
    deliverables: input.executionMode === "execute" ? ["A reviewable project patch"] : ["A direct answer or analysis"],
    constraints: ["Do not invent missing business requirements", "Never guess user intent for facts that change the result", "If a required business slot is missing, ask — do not generate a deliverable", "Label uncertainty only after asking; do not silently fill gaps"],
    acceptanceCriteria: input.executionMode === "execute" ? ["Patch is valid", "Every changed file is listed", "User approves before writing", "Business slots confirmed by the user"] : ["Answer addresses the stated objective", "Unsupported actions are stated plainly", "No invented business facts"],
    allowedActions: ["Use the connected model", ...(input.hasAttachments ? ["Read user-attached files"] : []), ...(input.executionMode === "execute" && input.hasFolder ? ["Prepare a patch inside the approved folder"] : [])],
    forbiddenActions: ["Silent paid upgrade", "Unapproved file write", "Unsupported completion claim", "Send unrelated context", "Invent destinations, schedules, sources, or overwrite policy", "Generate without confirmed business evidence"],
    privacyLevel: input.hasAttachments ? "provider_allowed" : "local",
    qualityTarget: input.budgetMode === "quality" ? "verified" : input.budgetMode === "economy" ? "draft" : "standard",
    budget: { mode: input.freeEligible ? "free-first" : input.budgetMode, allowPaidUpgrade: !input.freeEligible, maxRetries: 0 },
  };
}

export type RoutingDecision = {
  method: string;
  reason: string;
  steps: string[];
  actualModelPolicy: string;
  commercialInfluence: "none";
  needsApproval: boolean;
};

export function routeForUser(goal: GoalContract): RoutingDecision {
  const q = goal.objective.toLowerCase();
  const deterministic = /csv|excel|xlsx|thống kê|statistics|calculate|tính toán|chuẩn hóa|normalize/.test(q);
  const coding = /code|script|app|tool|bug|repo|project/.test(q);
  const method = deterministic ? "Deterministic processing first, model explanation second" : coding && goal.allowedActions.some(x => x.includes("patch")) ? "Coding model prepares a reviewable folder patch" : "Connected model with a minimum context pack";
  return {
    method,
    reason: deterministic ? "Calculations and transformations should be reproducible." : coding ? "The requested deliverable is code; changes remain behind approval." : "No narrower deterministic tool is available for this language task.",
    steps: deterministic ? ["Parse only relevant data", "Run reproducible transformation", "Use the model only to explain"] : ["Compile minimum context", "Call the connected model", "Verify capability and disclose evidence"],
    actualModelPolicy: goal.budget.mode === "free-first" ? "Use a qualified free route; never upgrade silently" : "Use the connected model; report provider usage after execution",
    commercialInfluence: "none",
    needsApproval: goal.allowedActions.some(x => x.includes("patch")),
  };
}

export type ContextPack = {
  currentGoal: string;
  included: string[];
  excluded: string[];
  tokenEstimate: number;
};

export function compileContextPack(input: { goal: GoalContract; policy: string; attachmentTexts: string[]; workspaceText?: string; replyContext?: string }): ContextPack {
  const included = ["Goal Contract", "active user-interest policy"];
  if (input.attachmentTexts.length) included.push(`${input.attachmentTexts.length} relevant attachment(s)`);
  if (input.workspaceText) included.push("selected workspace file");
  if (input.replyContext) included.push("result being commented on");
  const payload = [input.goal.objective, input.policy, ...input.attachmentTexts, input.workspaceText || "", input.replyContext || ""].join("\n");
  return { currentGoal: input.goal.objective, included, excluded: ["unselected project files", "unrelated conversation history", "superseded assumptions"], tokenEstimate: Math.ceil(payload.length / 4) };
}

export type ReceiptSavings = {
  /** Estimated tokens of the packed prompt Userward actually sent. */
  compactTokens: number;
  /** Estimated tokens of the free-format baseline for the same goal/extras. */
  freeTokens: number;
  savedTokens: number;
  savedPct: number;
};

export type ExecutionReceipt = {
  status: "completed" | "preview" | "failed";
  model: string;
  tools: string[];
  dataSent: string[];
  changes: string[];
  evidence: string[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number };
  /** Counterfactual vs free-format baseline (estimates). Prefer usage for billed tokens. */
  savings?: ReceiptSavings;
  /** Inspectable Clear Brief id when this run followed a clarify gate. */
  briefId?: string;
  briefSummary?: string;
};

export function createExecutionReceipt(input: {
  status: ExecutionReceipt["status"];
  model: string;
  context: ContextPack;
  usage?: ExecutionReceipt["usage"];
  changes?: string[];
  evidence?: string[];
  savings?: ReceiptSavings;
  briefId?: string;
  briefSummary?: string;
}): ExecutionReceipt {
  return {
    status: input.status,
    model: input.model,
    tools: ["Minimum Context Engine", "connected model"],
    dataSent: input.context.included,
    changes: input.changes || [],
    evidence: input.evidence || (input.status === "completed" ? ["Provider returned final content"] : []),
    usage: input.usage,
    ...(input.savings ? { savings: input.savings } : {}),
    ...(input.briefId ? { briefId: input.briefId } : {}),
    ...(input.briefSummary ? { briefSummary: input.briefSummary } : {}),
  };
}
