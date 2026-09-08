import type { PolicyAssessment, PolicyLevel } from "./policy-rag.ts";
import { translate, type AppLocale, type Translator } from "./i18n.ts";

/** User-visible safety copy. Never includes policy IDs, scores, or “Policy RAG” / legal-gate labels. Never blocks send. */
export type PublicSafetyView =
  | { kind: "silent" }
  | { kind: "warn"; text: string };

export function describePublicSafety(assessment: PolicyAssessment, locale: AppLocale = "en"): PublicSafetyView {
  if (assessment.level === "allow") return { kind: "silent" };
  return { kind: "warn", text: policyWarningText(assessment.level, locale) };
}

export function policyWarningText(level: PolicyLevel, locale: AppLocale = "en"): string {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  if (level === "block") return t("policyWarningLegal");
  if (level === "review") return t("policyWarningReview");
  if (level === "consent") return t("policyWarningConsent");
  return "";
}

export function policyResultWarning(assessment: PolicyAssessment, locale: AppLocale = "en"): string {
  const view = describePublicSafety(assessment, locale);
  return view.kind === "warn" ? view.text : "";
}

/** Policy never holds send. Signature kept so callers and tests stay stable. */
export function isPublicSafetyReady(_view?: PublicSafetyView, _purpose?: string): boolean {
  return true;
}

export function publicSafetyHasForbiddenCopy(text: string): boolean {
  return /policy[_\s-]?id|policy rag|legal gate|confidence:\s*\d|SYN-IMPERSONATION|MINOR-SEXUAL|CYBER-CREDENTIAL/i.test(text);
}

export function openRouterPrivacyAssistantText(t: Translator): string {
  return `${t("openRouterPrivacyInResult")} ${t("openRouterPrivacyMessage")} ${t("retryOrSwitchModel")}`;
}

export function appendResultWarning(text: string, warning: string): string {
  const body = text.trim();
  const note = warning.trim();
  if (!note) return body;
  if (!body) return note;
  if (body.includes(note)) return body;
  return `${body}\n\n${note}`;
}
