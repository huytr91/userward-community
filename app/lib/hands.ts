/** Folder actions run in this Userward window. Desktop apps are not launched. */

import { translate, type Translator } from "./i18n.ts";

export const HAND_INTENTS = ["workspace.list", "workspace.read", "workspace.patch", "files.extract", "desktop.rpa"] as const;
export type HandIntent = (typeof HAND_INTENTS)[number];

export type HandsCommand = { action: "run"; intent: HandIntent; payload?: Record<string, string> };
export type HandDispatchResult = {
  ok: boolean;
  available: boolean;
  intent: string;
  evidence: string[];
  message: string;
};

export type BrowserHandContext = {
  folderName?: string;
  filePaths: string[];
  selectedPath?: string;
  selectedText?: string;
  attachmentNames: string[];
  hasPendingPatch: boolean;
  executeMode: boolean;
};

export function isHandIntent(value: string): value is HandIntent {
  return (HAND_INTENTS as readonly string[]).includes(value);
}

export function looksLikeDesktopRpaGoal(text: string) {
  return /power automate|powerautomate|outlook|uipath|n8n|\brpa\b/i.test(text);
}

export function looksLikeWorkspaceHandGoal(text: string) {
  return /folder|workspace|thư mục|patch|viết file|sửa file|create file|update file|list files|đọc file|scan (the )?folder|project work|làm việc với dự án/i.test(text);
}

export function looksLikeHandGoal(text: string) {
  return looksLikeWorkspaceHandGoal(text) || looksLikeDesktopRpaGoal(text) || /đính kèm|attach(ed)? files|extract/i.test(text);
}

export function parseHandsBlock(text: string): HandsCommand | null {
  const fence = text.match(/```uw-hands\s*([\s\S]*?)```/i);
  const raw = fence?.[1]?.trim() || "";
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const command = value as { action?: unknown; intent?: unknown; payload?: unknown };
    const actionOk = command.action === "run" || command.action === "rpa_dispatch";
    if (!actionOk || typeof command.intent !== "string") return null;
    const intent = command.action === "rpa_dispatch" && !isHandIntent(command.intent) ? "desktop.rpa" : command.intent;
    if (!isHandIntent(intent)) return null;
    const payload: Record<string, string> = {};
    if (command.payload && typeof command.payload === "object") {
      for (const [key, item] of Object.entries(command.payload as Record<string, unknown>)) {
        if (typeof item === "string" && key.length <= 40 && item.length <= 500) payload[key] = item;
      }
    }
    return { action: "run", intent, payload };
  } catch {
    return null;
  }
}

export function stripHandsFence(text: string) {
  return text.replace(/```uw-hands[\s\S]*?```/gi, "").trim();
}

export function inferHandIntent(goal: string): HandIntent {
  const q = goal.toLowerCase();
  if (looksLikeDesktopRpaGoal(q)) return "desktop.rpa";
  if (/đính kèm|attach/.test(q) && /extract|đọc|parse|csv|pdf|docx/.test(q)) return "files.extract";
  if (/đọc|read|mở file|open file/.test(q) && /file|workspace/.test(q)) return "workspace.read";
  if (/list|liệt kê|scan|thư mục|folder/.test(q)) return "workspace.list";
  if (/patch|viết|sửa|create|update|code|file/.test(q)) return "workspace.patch";
  return "workspace.list";
}

export function runBrowserHand(intent: HandIntent, ctx: BrowserHandContext, t: Translator = (key, vars) => translate("en", key, vars)): HandDispatchResult {
  if (intent === "desktop.rpa") {
    return {
      ok: false,
      available: false,
      intent,
      evidence: [],
      message: t("handDesktopUnavailable"),
    };
  }
  if (intent === "files.extract") {
    const evidence = ctx.attachmentNames.slice(0, 20);
    return {
      ok: evidence.length > 0,
      available: true,
      intent,
      evidence,
      message: evidence.length ? t("handExtracted", { count: evidence.length }) : t("handAttachFiles"),
    };
  }
  if (intent === "workspace.list") {
    if (!ctx.folderName) {
      return { ok: false, available: true, intent, evidence: [], message: t("handNeedFolder") };
    }
    const evidence = ctx.filePaths.slice(0, 40);
    return {
      ok: true,
      available: true,
      intent,
      evidence: evidence.length ? evidence : [`folder:${ctx.folderName}`],
      message: evidence.length ? t("handListed", { count: evidence.length, name: ctx.folderName }) : t("handFolderEmpty", { name: ctx.folderName }),
    };
  }
  if (intent === "workspace.read") {
    if (!ctx.folderName) {
      return { ok: false, available: true, intent, evidence: [], message: t("handNeedFolder") };
    }
    if (!ctx.selectedPath) {
      return { ok: false, available: true, intent, evidence: ctx.filePaths.slice(0, 12), message: t("handOpenFile") };
    }
    const preview = (ctx.selectedText || "").slice(0, 400);
    return {
      ok: true,
      available: true,
      intent,
      evidence: [ctx.selectedPath, preview ? `preview:${preview.length} chars` : "empty"],
      message: t("handReadFile", { path: ctx.selectedPath, name: ctx.folderName }),
    };
  }
  if (!ctx.folderName) {
    return { ok: false, available: true, intent, evidence: [], message: t("handNeedFolder") };
  }
  if (ctx.hasPendingPatch) {
    return { ok: true, available: true, intent, evidence: ["pending-patch"], message: t("handApplyingPatch") };
  }
  if (!ctx.executeMode) {
    return { ok: false, available: true, intent, evidence: [`folder:${ctx.folderName}`], message: t("handNeedProjectWork") };
  }
  return {
    ok: false,
    available: true,
    intent,
    evidence: [`folder:${ctx.folderName}`],
    message: t("handNeedConfirmRun"),
  };
}
