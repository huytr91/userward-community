import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { composerRunDisabled, executeNeedsConnectedFolder } from "../app/lib/send-guards.ts";
import { translate } from "../app/lib/i18n.ts";

test("execute without a folder is blocked; analyze chat is not", () => {
  assert.equal(executeNeedsConnectedFolder("execute", false), true);
  assert.equal(executeNeedsConnectedFolder("execute", true), false);
  assert.equal(executeNeedsConnectedFolder("analyze", false), false);
  assert.equal(executeNeedsConnectedFolder("analyze", true), false);
});

test("Confirm & run stays enabled with draft even if interview/clarify incomplete", () => {
  assert.equal(composerRunDisabled({
    hasProvider: true,
    hasDraftOrAttachments: true,
    clarificationNeeded: true,
    interviewComplete: false,
    safetyAskPending: false,
    executeNeedsFolder: false,
  }), false);
  assert.equal(composerRunDisabled({
    hasProvider: true,
    hasDraftOrAttachments: true,
    clarificationNeeded: false,
    interviewComplete: false,
    safetyAskPending: true,
    executeNeedsFolder: true,
  }), false);
  assert.equal(composerRunDisabled({
    hasProvider: true,
    hasDraftOrAttachments: false,
    clarificationNeeded: false,
    interviewComplete: true,
    safetyAskPending: false,
    executeNeedsFolder: true,
  }), true);
});

test("brief submit can require complete interview slots", () => {
  assert.equal(composerRunDisabled({
    hasProvider: true,
    hasDraftOrAttachments: true,
    interviewComplete: false,
    requireInterviewComplete: true,
  }), true);
  assert.equal(composerRunDisabled({
    hasProvider: true,
    hasDraftOrAttachments: true,
    interviewComplete: true,
    requireInterviewComplete: true,
  }), false);
});

test("policy ask never disables Confirm & run", () => {
  assert.equal(composerRunDisabled({
    hasProvider: true,
    hasDraftOrAttachments: true,
    clarificationNeeded: false,
    interviewComplete: true,
    safetyAskPending: true,
    executeNeedsFolder: false,
  }), false);
});

test("page send path posts a timeline card instead of a silent folder return", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /executeNeedsConnectedFolder/);
  assert.match(page, /missingFolderTitle/);
  assert.match(page, /setEntries\(prev => \[\.\.\.prev, userEntry, folderEntry\]\)/);
  assert.doesNotMatch(page, /if \(executionMode === "execute" && !folderHandle\) \{ setWorkspaceError/);
  assert.match(page, /composerRunDisabled/);
  assert.match(page, /interviewSlotsComplete/);
  assert.match(page, /briefSlotsIncomplete/);
  assert.match(page, /UNKNOWN_CONTENT_RULE/);
  assert.match(page, /ORDINARY_CHAT_RULE/);
  assert.match(page, /isActionableGoal/);
  assert.doesNotMatch(page, /continueWithoutAnswers|skipAnswers/);
  assert.match(page, /pendingInterview/);
  assert.match(page, /interview-card/);
  assert.match(page, /shouldOfferPostSendInterview/);
  assert.doesNotMatch(page, /setIsTyping|guidanceReady/);
  assert.doesNotMatch(page, /setTimeout\([^)]*,\s*2000\)/);
  assert.doesNotMatch(page, /clarify-card|capability-card|usage-plan|project-advisor/);
  assert.doesNotMatch(page, /capabilityEntry/);
  assert.match(page, /capabilityNotice/);
});

test("folder-required copy names both recovery actions", () => {
  assert.match(translate("vi", "missingFolderAction"), /Đổi thư mục/);
  assert.match(translate("vi", "missingFolderAction"), /Chat thường/);
  assert.match(translate("en", "missingFolderAction"), /Change folder/);
  assert.match(translate("en", "missingFolderAction"), /\bChat\b/);
  assert.match(translate("vi", "missingFolderMessage"), /không có chỗ để ghi/i);
});
