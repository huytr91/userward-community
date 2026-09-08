/**
 * One-shot OpenRouter token comparison: Userward compact prompt vs naive free-format.
 * Reads the key only from browser storage or env; never prints the full secret.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MASK = (key) => (key ? `${key.slice(0, 10)}…${key.slice(-4)} (len=${key.length})` : "none");

function decodeUtf16leStrings(buf) {
  const out = [];
  let i = 0;
  while (i + 1 < buf.length) {
    if (buf[i + 1] === 0 && buf[i] >= 32 && buf[i] < 127) {
      const chars = [];
      while (i + 1 < buf.length && buf[i + 1] === 0 && buf[i] >= 32 && buf[i] < 127) {
        chars.push(String.fromCharCode(buf[i]));
        i += 2;
      }
      if (chars.length >= 12) out.push(chars.join(""));
    } else {
      i += 1;
    }
  }
  return out;
}

function extractConnectionFromBytes(buf) {
  const utf8 = buf.toString("utf8");
  const utf16 = decodeUtf16leStrings(buf).join("\n");
  const hay = `${utf8}\n${utf16}`;
  const jsonMatches = hay.match(/\{"provider"\s*:\s*"(?:OpenRouter|OpenAI|Anthropic|Google|DeepSeek|Qwen|Kimi)"\s*,\s*"model"\s*:\s*"[^"]+"\s*,\s*"apiKey"\s*:\s*"[^"]+"}/g) || [];
  for (const raw of jsonMatches.reverse()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.provider === "OpenRouter" && parsed.apiKey && parsed.apiKey !== "local") return parsed;
    } catch { /* ignore */ }
  }
  const keyMatch = hay.match(/sk-or-v1-[A-Za-z0-9_-]{16,}/);
  if (keyMatch) return { provider: "OpenRouter", model: "openrouter/auto", apiKey: keyMatch[0] };
  return null;
}

function loadConnection() {
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: "OpenRouter", model: process.env.OPENROUTER_MODEL || "openrouter/auto", apiKey: process.env.OPENROUTER_API_KEY, source: "env" };
  }
  const home = homedir();
  const roots = [
    join(home, "AppData/Local/Microsoft/Edge/User Data"),
    join(home, "AppData/Local/Google/Chrome/User Data"),
  ];
  const profileNames = ["Default", "Profile 1", "Profile 2"];
  const stores = ["Local Storage/leveldb", "Session Storage"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const profile of profileNames) {
      for (const store of stores) {
        const dir = join(root, profile, store);
        if (!existsSync(dir)) continue;
        let files = [];
        try { files = readdirSync(dir); } catch { continue; }
        for (const name of files) {
          if (!/\.(ldb|log|sst)$/i.test(name) && name !== "LOG") continue;
          try {
            const found = extractConnectionFromBytes(readFileSync(join(dir, name)));
            if (found) return { ...found, source: `${root.includes("Edge") ? "Edge" : "Chrome"} ${profile} ${store}` };
          } catch { /* locked file */ }
        }
      }
    }
  }
  return null;
}

const COMPACT_CHAT_POLICY = [
  "MODE: DIRECT CHAT / ANALYSIS. Answer the user goal directly and concisely.",
  "OUTPUT: Concise, correct format",
  "SOURCES: Require a source for factual claims",
  "INFERENCE: Label inferences",
  "BUDGET: balanced",
  "Never claim an external action or file change without tool evidence.",
  "Ask only for missing business facts that materially change the answer.",
  "SAFETY: Evaluate silently. Never output policy IDs, scores, or a safety report. Answer the user's goal.",
].join("\n");

const FREE_FORMAT_POLICY = [
  "You are a helpful general-purpose assistant.",
  "Follow every product rule below even when the user did not ask about them.",
  "USER INTEREST CONSTITUTION:",
  "1. Use a deterministic tool instead of a model when it is sufficient.",
  "2. Choose the least expensive qualified route; never silently upgrade free to paid.",
  "3. Send only the minimum necessary context and disclose what leaves the device.",
  "4. Perform no side effect without explicit, action-scoped approval.",
  "5. Make no completion claim without execution evidence.",
  "6. Disclose the actual model, tool, cost, fallback, and failure.",
  "7. Never turn weak retrieval into a legal conclusion.",
  "8. Do not ask users to make technical decisions the manager can safely make.",
  "9. Route without provider commission or commercial preference.",
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
  "CAPABILITY HONESTY: Never claim to have created, rendered, uploaded, sent, published, executed, or changed anything unless the connected tool actually performed that action and returned evidence. If the requested artifact or action is unsupported, state that plainly before offering supported alternatives.",
  "ZERO-ASSUMPTION POLICY: Never invent or silently assume missing business requirements, inputs, outputs, destinations, permissions, schedules, constraints, or acceptance criteria. Stop and request clarification when any of these can materially change the result. Ask only plain-language questions with choices or Yes/No; never ask the end user to select libraries, frameworks, APIs, architecture, or test tools.",
  "USER OVERRIDE POLICY: A free-form answer written by the user has higher priority than AI-suggested choices whenever they conflict.",
  "SAFETY: Evaluate silently. Never output policy IDs, scores, safe/allow, or a safety report. Answer the user's goal. Refuse only a concrete harmful action and offer a legal alternative.",
  "CLARIFICATION GATE: COMPLETE. Do not ask another requirements interview in this response. Never ask the user to choose architecture, folder structure, source-code layout, libraries, frameworks, APIs, or tests.",
].join("\n");

const UNUSED_HISTORY = [
  { role: "user", content: "Earlier we talked about migrating the finance folder to a new layout and you recapped every file. Please keep that unused context." },
  { role: "assistant", content: "Previous recap: we discussed splitting reports, renaming invoices, and keeping archived CSVs. None of that is needed for the current goal, but a naive prompt would still send this paragraph plus the following leftover notes about folder structure, acceptance criteria, and superseded assumptions from last week.".repeat(3) },
  { role: "user", content: "Also ignore the old request to generate a PowerPoint. That was superseded." },
  { role: "assistant", content: "Understood. I will keep the old PowerPoint request in history anyway if this is a free-format dump.".repeat(2) },
];

const SAMPLE_REPORT = `QUARTERLY OPERATIONS MEMO
Audience: leadership. Status: draft for analysis only.
${"Week summary: inbound tickets rose, refund rate was stable, and two vendors missed SLA. ".repeat(80)}
Appendix A: raw notes that a minimum-context pack should still include because they are the attached file.
${"Vendor Alpha late by 2 days; Vendor Beta on time; Vendor Gamma partial shipment. ".repeat(40)}
`;

const UNUSED_FILE = `UNUSED WORKSPACE FILE notes-old.md
${"This file is not selected and should not be sent by Userward compileContextPack. ".repeat(60)}
`;

const SAMPLE_CODE = `export function normalizeInvoice(row) {
  const amount = Number(row.amount || 0);
  const currency = String(row.currency || "USD").toUpperCase();
  return { id: String(row.id || ""), amount, currency, late: Boolean(row.late) };
}

export function summarizeVendors(rows) {
  const byVendor = new Map();
  for (const row of rows) {
    const key = row.vendor || "unknown";
    const item = byVendor.get(key) || { vendor: key, total: 0, late: 0 };
    item.total += Number(row.amount || 0);
    if (row.late) item.late += 1;
    byVendor.set(key, item);
  }
  return [...byVendor.values()].sort((a, b) => b.total - a.total);
}
`;

const UNUSED_CODE = `// leftover debug script from another task
${"console.log('stale workspace file that naive full-context would dump'); ".repeat(40)}
`;

function chunkText(text, maxChars = 24_000) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length) {
    let end = Math.min(maxChars, rest.length);
    if (end < rest.length) {
      const boundary = Math.max(rest.lastIndexOf("\n\n", end), rest.lastIndexOf("\n", end));
      if (boundary > maxChars * 0.6) end = boundary;
    }
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  return chunks;
}

function buildCases() {
  const chatGoal = "Tóm tắt trong 3 câu: Userward là ứng dụng local-first giúp gửi đúng ngữ cảnh tối thiểu tới model.";
  const analysisGoal = "Phân tích memo đính kèm: nêu 3 rủi ro vận hành và 1 hành động ưu tiên.";
  const codingGoal = "Review hai hàm normalizeInvoice và summarizeVendors: nêu 2 rủi ro và 1 test tối thiểu.";
  const reportChunks = chunkText(SAMPLE_REPORT, 24_000).slice(0, 4).join("\n\n--- CONTINUED ---\n");

  return [
    {
      id: "short-chat",
      label: "Chat ngắn",
      userward: [{ role: "user", content: `${COMPACT_CHAT_POLICY}\n\nUSER GOAL:\n${chatGoal}` }],
      freeFormat: [
        ...UNUSED_HISTORY,
        { role: "user", content: `${FREE_FORMAT_POLICY}\n\nUNUSED PROJECT HISTORY:\n${UNUSED_HISTORY.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nUSER GOAL:\n${chatGoal}` },
      ],
    },
    {
      id: "file-analysis",
      label: "Phân tích file",
      userward: [{ role: "user", content: `${COMPACT_CHAT_POLICY}\n\nUSER GOAL:\n${analysisGoal}\n\n--- ATTACHED FILE: ops-memo.txt (1 context chunk) ---\n${reportChunks}` }],
      freeFormat: [
        ...UNUSED_HISTORY,
        { role: "user", content: `${FREE_FORMAT_POLICY}\n\nUNUSED PROJECT HISTORY:\n${UNUSED_HISTORY.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\n--- ATTACHED FILE: ops-memo.txt ---\n${SAMPLE_REPORT}\n\n--- WORKSPACE FILE: notes-old.md ---\n${UNUSED_FILE}\n\nUSER GOAL:\n${analysisGoal}` },
      ],
    },
    {
      id: "coding",
      label: "Coding",
      userward: [{ role: "user", content: `${COMPACT_CHAT_POLICY}\nOUTPUT: Patch tối thiểu + kết quả test\nSOURCES: Code và log là nguồn chính\n\nUSER GOAL:\n${codingGoal}\n\n--- ATTACHED FILE: invoices.js (1 context chunk) ---\n${SAMPLE_CODE}` }],
      freeFormat: [
        ...UNUSED_HISTORY,
        { role: "user", content: `${FREE_FORMAT_POLICY}\nUSAGE PROFILE: Coding\n\nUNUSED PROJECT HISTORY:\n${UNUSED_HISTORY.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\n--- ATTACHED FILE: invoices.js ---\n${SAMPLE_CODE}\n\n--- WORKSPACE FILE: debug-old.js ---\n${UNUSED_CODE}\n\n--- WORKSPACE FILE: notes-old.md ---\n${UNUSED_FILE}\n\nUSER GOAL:\n${codingGoal}` },
      ],
    },
  ];
}

function readUsage(data, model) {
  const usage = data.usage && typeof data.usage === "object" ? data.usage : {};
  return {
    selectedModel: data.selectedModel || data.model || model,
    promptTokens: Number(usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? 0),
    completionTokens: Number(usage.completionTokens ?? usage.completion_tokens ?? usage.output_tokens ?? 0),
    totalTokens: Number(usage.totalTokens ?? usage.total_tokens ?? 0),
    cost: Number(usage.cost ?? 0),
    hasUsage: Boolean(usage && (usage.prompt_tokens != null || usage.promptTokens != null || usage.total_tokens != null || usage.totalTokens != null)),
  };
}

async function callOpenRouterDirect({ apiKey, model, messages }) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "http://127.0.0.1:3001", "X-OpenRouter-Title": "Userward Local token measure" },
    body: JSON.stringify({ model, messages, max_tokens: 80, stream: false }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    const message = data?.error?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return readUsage(data, model);
}

async function callOpenRouter({ apiKey, model, messages, viaLocal }) {
  if (viaLocal) {
    try {
      const response = await fetch("http://127.0.0.1:3001/api/providers/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "OpenRouter", apiKey, model, executionMode: "analyze", stream: false, maxOutputTokens: 400, messages }),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (response.ok) return readUsage(data, model);
    } catch { /* fall through to direct OpenRouter */ }
  }
  return callOpenRouterDirect({ apiKey, model, messages });
}

async function localServerUp() {
  try {
    const response = await fetch("http://127.0.0.1:3001/", { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

function pct(freeTokens, userwardTokens) {
  if (!freeTokens) return null;
  return Math.round(((freeTokens - userwardTokens) / freeTokens) * 1000) / 10;
}

const connection = loadConnection();
if (!connection) {
  console.log(JSON.stringify({
    ok: false,
    blocked: "Không tìm thấy OpenRouter key trong env OPENROUTER_API_KEY, localStorage/sessionStorage Edge/Chrome (minimum-provider-connection), hoặc chuỗi sk-or-v1- trên đĩa.",
    howToProvide: "Trong Userward: bật “Ghi nhớ trên máy này” rồi Save; hoặc set env OPENROUTER_API_KEY (và tùy chọn OPENROUTER_MODEL) rồi chạy lại script. Không cần dán key vào chat.",
  }, null, 2));
  process.exit(2);
}

const viaLocal = await localServerUp();
const only = new Set(process.argv.slice(2).filter((item) => !item.startsWith("-")));
const cases = buildCases().filter((item) => !only.size || only.has(item.id));
const rows = [];
let failed = null;
for (const item of cases) {
  try {
    const userward = await callOpenRouter({ apiKey: connection.apiKey, model: connection.model, messages: item.userward, viaLocal });
    const freeFormat = await callOpenRouter({ apiKey: connection.apiKey, model: connection.model, messages: item.freeFormat, viaLocal });
    rows.push({
      id: item.id,
      label: item.label,
      userwardChars: item.userward.reduce((n, m) => n + m.content.length, 0),
      freeFormatChars: item.freeFormat.reduce((n, m) => n + m.content.length, 0),
      userward,
      freeFormat,
      promptSavedPct: pct(freeFormat.promptTokens, userward.promptTokens),
      totalSavedPct: pct(freeFormat.totalTokens, userward.totalTokens),
    });
  } catch (error) {
    failed = { id: item.id, error: String(error?.message || error) };
    break;
  }
}

const promptUserward = rows.reduce((n, r) => n + r.userward.promptTokens, 0);
const promptFree = rows.reduce((n, r) => n + r.freeFormat.promptTokens, 0);
const totalUserward = rows.reduce((n, r) => n + r.userward.totalTokens, 0);
const totalFree = rows.reduce((n, r) => n + r.freeFormat.totalTokens, 0);

console.log(JSON.stringify({
  ok: rows.length > 0 && !failed,
  model: connection.model,
  selectedModel: rows[0]?.userward.selectedModel || connection.model,
  keySource: connection.source,
  keyMasked: MASK(connection.apiKey),
  via: viaLocal ? "http://127.0.0.1:3001/api/providers/chat" : "https://openrouter.ai/api/v1/chat/completions",
  rows,
  aggregate: {
    promptUserward,
    promptFree,
    promptSavedPct: pct(promptFree, promptUserward),
    totalUserward,
    totalFree,
    totalSavedPct: pct(totalFree, totalUserward),
  },
  failed,
  usageMissing: rows.some((r) => !r.userward.hasUsage || !r.freeFormat.hasUsage),
}, null, 2));
