export type ExecutionMode = "analyze" | "execute";

/** Project-work (execute) cannot write files without a live folder handle. Plain chat must not require one. */
export function executeNeedsConnectedFolder(executionMode: ExecutionMode, hasFolder: boolean): boolean {
  return executionMode === "execute" && !hasFolder;
}

/**
 * Confirm & run stays clickable whenever there is a provider and something to send.
 * Policy asks never grey out send. Incomplete interview is gated inside sendMessage
 * (no provider call) rather than greying the composer — except when a pending brief
 * is active and slots are still missing, callers may pass interviewComplete: false
 * to disable the brief-submit control.
 * Missing folder in execute still leaves the button enabled so send can show a timeline card.
 */
export function composerRunDisabled(input: {
  hasProvider: boolean;
  hasDraftOrAttachments: boolean;
  clarificationNeeded?: boolean;
  interviewComplete?: boolean;
  safetyAskPending?: boolean;
  executeNeedsFolder?: boolean;
  /** When true, incomplete interview disables this control (brief submit). */
  requireInterviewComplete?: boolean;
}): boolean {
  if (!input.hasProvider) return true;
  if (!input.hasDraftOrAttachments) return true;
  if (input.requireInterviewComplete && input.interviewComplete === false) return true;
  return false;
}
