/**
 * On-device personal interview pack (“personal RAG” for frequent answers).
 * Never leaves the browser. Not used for model training or server sync.
 */

export const PERSONAL_PACK_STORAGE_KEY = "userward-personal-interview-pack-v1";
export const PERSONAL_PACK_ENABLED_KEY = "userward-personal-interview-enabled";

export const PERSONAL_PACK_MIN_COUNT = 3;
export const PERSONAL_PACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const PERSONAL_PACK_MAX_OPTIONS_PER_SLOT = 3;

export type PersonalPackEntry = {
  intent: string;
  slotId: string;
  value: string;
  count: number;
  lastUsedAt: number;
};

export type PersonalPackState = {
  enabled: boolean;
  entries: PersonalPackEntry[];
};

const VAGUE_SKIP =
  /^(ok|okay|oke|ừ|uh|um|yes|no|có|không|tùy|tùy bạn|whatever|something|idk|ko biết|không biết|gì cũng được|maybe|chưa quyết định|not sure|unsure|không rõ|chưa xác định)$/i;

export function isMemorableInterviewValue(value: string): boolean {
  const text = value.trim();
  if (text.length < 4 || text.length > 120) return false;
  if (VAGUE_SKIP.test(text)) return false;
  return true;
}

export function emptyPersonalPack(enabled = true): PersonalPackState {
  return { enabled, entries: [] };
}

export function readPersonalPackFromStorage(storage: Pick<Storage, "getItem"> | null | undefined): PersonalPackState {
  if (!storage) return emptyPersonalPack(true);
  const enabledRaw = storage.getItem(PERSONAL_PACK_ENABLED_KEY);
  const enabled = enabledRaw == null ? true : enabledRaw === "1" || enabledRaw === "true";
  try {
    const raw = storage.getItem(PERSONAL_PACK_STORAGE_KEY);
    if (!raw) return emptyPersonalPack(enabled);
    const parsed = JSON.parse(raw) as { entries?: PersonalPackEntry[] };
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter(entry => entry && typeof entry.value === "string" && typeof entry.slotId === "string")
      : [];
    return { enabled, entries };
  } catch {
    return emptyPersonalPack(enabled);
  }
}

export function writePersonalPackToStorage(
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  state: PersonalPackState,
): void {
  if (!storage) return;
  storage.setItem(PERSONAL_PACK_ENABLED_KEY, state.enabled ? "1" : "0");
  if (!state.enabled) return;
  storage.setItem(PERSONAL_PACK_STORAGE_KEY, JSON.stringify({ entries: state.entries }));
}

export function clearPersonalPackInStorage(storage: Pick<Storage, "removeItem" | "setItem"> | null | undefined): void {
  if (!storage) return;
  storage.removeItem(PERSONAL_PACK_STORAGE_KEY);
  storage.setItem(PERSONAL_PACK_ENABLED_KEY, "0");
}

export function recordPersonalAnswer(input: {
  state: PersonalPackState;
  intent: string;
  slotId: string;
  value: string;
  now?: number;
}): PersonalPackState {
  if (!input.state.enabled) return input.state;
  if (!isMemorableInterviewValue(input.value)) return input.state;
  const now = input.now ?? Date.now();
  const intent = (input.intent || "general").trim() || "general";
  const slotId = input.slotId.trim();
  const value = input.value.trim();
  const entries = [...input.state.entries];
  const index = entries.findIndex(entry => entry.intent === intent && entry.slotId === slotId && entry.value === value);
  if (index >= 0) {
    const current = entries[index];
    entries[index] = { ...current, count: current.count + 1, lastUsedAt: now };
  } else {
    entries.push({ intent, slotId, value, count: 1, lastUsedAt: now });
  }
  return { enabled: true, entries: prunePersonalEntries(entries, now) };
}

export function prunePersonalEntries(entries: PersonalPackEntry[], now = Date.now()): PersonalPackEntry[] {
  return entries
    .filter(entry => now - entry.lastUsedAt <= PERSONAL_PACK_MAX_AGE_MS)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, 200);
}

/** Frequent answers eligible to surface as suggested options (not locked defaults). */
export function suggestedPersonalOptions(input: {
  state: PersonalPackState;
  intent: string;
  slotId: string;
  now?: number;
}): string[] {
  if (!input.state.enabled) return [];
  const now = input.now ?? Date.now();
  const intent = (input.intent || "general").trim() || "general";
  return input.state.entries
    .filter(entry =>
      entry.intent === intent
      && entry.slotId === input.slotId
      && entry.count >= PERSONAL_PACK_MIN_COUNT
      && now - entry.lastUsedAt <= PERSONAL_PACK_MAX_AGE_MS
      && isMemorableInterviewValue(entry.value))
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
    .slice(0, PERSONAL_PACK_MAX_OPTIONS_PER_SLOT)
    .map(entry => entry.value);
}

/** Merge personal suggestions into question options without removing “other” freedom. */
export function injectPersonalOptionsIntoQuestions(input: {
  questions: Array<{ id: string; label: string; ask: string; options: string[]; multi?: boolean }>;
  state: PersonalPackState;
  intent: string;
}): Array<{ id: string; label: string; ask: string; options: string[]; multi?: boolean }> {
  return input.questions.map(question => {
    const personal = suggestedPersonalOptions({ state: input.state, intent: input.intent, slotId: question.id });
    if (!personal.length) return question;
    const merged = [...personal.filter(option => !question.options.includes(option)), ...question.options];
    return { ...question, options: merged.slice(0, 8) };
  });
}
