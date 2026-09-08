export type ExecutionMode = "analyze" | "execute";

/** Project-work (execute) cannot write files without a live folder handle. Plain chat must not require one. */
export function executeNeedsConnectedFolder(executionMode: ExecutionMode, hasFolder: boolean): boolean {
  return executionMode === "execute" && !hasFolder;
}

/**
 * Confirm & run stays clickable whenever there is a provider and something to send.
 * Interview / clarification / policy never grey out send (ChatGPT-style).
 * Missing folder in execute still leaves the button enabled so send can show a timeline card.
 */
export function composerRunDisabled(input: {
  hasProvider: boolean;
  hasDraftOrAttachments: boolean;
  clarificationNeeded?: boolean;
  interviewComplete?: boolean;
  safetyAskPending?: boolean;
  executeNeedsFolder?: boolean;
}): boolean {
  if (!input.hasProvider) return true;
  if (!input.hasDraftOrAttachments) return true;
  return false;
}
