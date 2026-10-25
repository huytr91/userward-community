/**
 * Live smoke: model-first Call A interview quality across request situations.
 * Uses OPENROUTER_API_KEY / saved browser key, or Ollama on 11434 if available.
 * Never prints full API keys.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  buildInterviewPlan,
  buildInterviewOnlyPrompt,
  parseModelInterviewQuestions,
  resolveCallAInterviewResult,
  isKnowledgeQuizQuestion,
} from "../app/lib/interview-pipeline.ts";

const LOCAL = "http://127.0.0.1:3001/api/providers/chat";
const MASK = (key) => (key ? `${key.slice(0, 8)}…${key.slice(-4)}` : "none");

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
    } else i += 1;
  }
  return out;
}

function extractConnectionFromBytes(buf) {
  const hay = `${buf.toString("utf8")}\n${decodeUtf16leStrings(buf).join("\n")}`;
  const jsonMatches = hay.match(/\{"provider"\s*:\s*"(?:OpenRouter|OpenAI|Anthropic|Google|DeepSeek|Qwen|Kimi|MuseAI|Ollama)"\s*,\s*"model"\s*:\s*"[^"]+"\s*,\s*"apiKey"\s*:\s*"[^"]+"}/g) || [];
  for (const raw of jsonMatches.reverse()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.provider && parsed.model && parsed.apiKey && parsed.apiKey !== "local") return parsed;
      if (parsed.provider === "Ollama" && parsed.model) return parsed;
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
  if (process.env.SMOKE_FORCE_OLLAMA === "1") return null;
  const roots = [
    join(homedir(), "AppData/Local/Microsoft/Edge/User Data"),
    join(homedir(), "AppData/Local/Google/Chrome/User Data"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const profile of ["Default", "Profile 1", "Profile 2"]) {
      for (const store of ["Local Storage/leveldb", "Session Storage"]) {
        const dir = join(root, profile, store);
        if (!existsSync(dir)) continue;
        let files = [];
        try { files = readdirSync(dir); } catch { continue; }
        for (const name of files) {
          if (!/\.(ldb|log|sst)$/i.test(name) && name !== "LOG") continue;
          try {
            const found = extractConnectionFromBytes(readFileSync(join(dir, name)));
            if (found) return { ...found, source: `${root.includes("Edge") ? "Edge" : "Chrome"} ${profile}` };
          } catch { /* locked */ }
        }
      }
    }
  }
  return null;
}

async function probeOllama() {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const data = await r.json();
    const models = (data.models || []).map(m => m.name).filter(Boolean);
    const pick = models.find(n => /qwen|llama|gemma|mistral/i.test(n)) || models[0];
    return pick ? { provider: "Ollama", model: pick, apiKey: "local", source: "ollama" } : null;
  } catch {
    return null;
  }
}

const CASES = [
  {
    id: "build-app",
    ask: "giúp tôi tạo app login bằng React trong thư mục dự án",
    locale: "vi",
    mustMention: [/react|login|app|đăng nhập|thư mục|folder/i],
    forbidIds: [],
    allowCode: true,
  },
  {
    id: "automation-email",
    ask: "Tạo automation lấy email và lưu file PDF đính kèm vào thư mục Reports",
    locale: "vi",
    mustMention: [/email|gmail|outlook|pdf|reports|thư mục|folder|lưu/i],
    forbidIds: ["code_target"],
    allowCode: false,
  },
  {
    id: "compare-excel",
    ask: "có 1 email và 1 file excel, cần check khớp cột số tiền và tên ngân hàng",
    locale: "vi",
    mustMention: [/email|excel|số tiền|ngân|khớp|cột|match|amount|bank/i],
    forbidIds: ["code_target"],
    allowCode: false,
  },
  {
    id: "gtm",
    ask: "viết chiến lược content viral go-to-market cho app quản lý chi tiêu",
    locale: "vi",
    mustMention: [/viral|go-?to-?market|content|chi tiêu|kênh|tiktok|channel|audience|đối tượng/i],
    forbidIds: ["code_target", "destination", "schedule"],
    allowCode: false,
  },
  {
    id: "research-gold",
    ask: "phân tích thị trường vàng sắp tới cho quyết định cá nhân",
    locale: "vi",
    mustMention: [/vàng|gold|thời|tuần|tháng|quý|góc nhìn|cá nhân|output|tóm tắt|brief/i],
    forbidIds: ["code_target", "destination"],
    allowCode: false,
    forbidQuiz: true,
  },
];

function scoreCase(c, questions) {
  const blob = questions.map(q => `${q.id} ${q.label} ${q.ask} ${q.options.join(" ")}`).join("\n");
  const checks = [];
  const countOk = questions.length >= 2 && questions.length <= 4;
  checks.push({ name: "count_2_to_4", ok: countOk, detail: String(questions.length) });
  const endsQ = questions.every(q => /\?\s*$/.test(q.ask));
  checks.push({ name: "asks_end_with_?", ok: endsQ });
  const optsOk = questions.every(q => q.options.length >= 2);
  checks.push({ name: "options_ge_2", ok: optsOk });
  const mentionOk = c.mustMention.some(re => re.test(blob));
  checks.push({ name: "mentions_goal_cues", ok: mentionOk });
  const forbidHit = c.forbidIds.filter(id => questions.some(q => q.id === id));
  checks.push({ name: "no_forbidden_slots", ok: forbidHit.length === 0, detail: forbidHit.join(",") || "—" });
  if (!c.allowCode) {
    const codeLike = /kết quả code|coding outcome|patch|sửa file hiện có|create new file|optCode/i.test(blob);
    checks.push({ name: "no_coding_frame", ok: !codeLike });
  }
  if (c.forbidQuiz) {
    const quiz = questions.some(q => isKnowledgeQuizQuestion(q));
    checks.push({ name: "no_knowledge_quiz", ok: !quiz });
  }
  const generic = questions.filter(q => /choose the|chọn (một |phương án )?(thời gian|góc nhìn|đầu ra)|option a|option b/i.test(`${q.ask} ${q.options.join(" ")}`)).length;
  checks.push({ name: "not_blank_survey", ok: generic <= 1, detail: `generic=${generic}` });
  const pass = checks.every(x => x.ok);
  return { pass, checks, questions: questions.map(q => ({ id: q.id, ask: q.ask, options: q.options })) };
}

async function callInterview(conn, ask, locale, plan) {
  const prompt = buildInterviewOnlyPrompt(ask, locale, plan.questions, {
    intentFamily: plan.intentFamily,
    allowedSlotIds: plan.allowedSlotIds,
  });
  const response = await fetch(LOCAL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      provider: conn.provider,
      apiKey: conn.apiKey,
      model: conn.model,
      executionMode: "analyze",
      stream: false,
      maxOutputTokens: 900,
      budgetMode: "balanced",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw.slice(0, 300) }; }
  if (!response.ok) {
    return { ok: false, error: data.error || data.code || `HTTP ${response.status}`, raw: raw.slice(0, 400) };
  }
  const parsed = parseModelInterviewQuestions(data.text || "");
  const resolved = resolveCallAInterviewResult({
    seed: plan.questions,
    modelQuestions: parsed,
    gate: plan.gate,
    allowPassthroughOnCallAFail: plan.allowPassthroughOnCallAFail,
    allowedSlotIds: plan.allowedSlotIds,
    locale,
    goal: ask,
  });
  return {
    ok: true,
    parsedCount: parsed.length,
    source: resolved.action === "interview" && resolved.notice === "fallback" ? "fallback" : (parsed.length >= 2 ? "model" : "mixed"),
    questions: resolved.action === "interview" ? resolved.questions : [],
    textPreview: (data.text || "").slice(0, 280),
  };
}

const routingOrdinary = ["tạo ra vàng như nào", "giá vàng hôm nay thế nào?", "báo cáo này thế nào?"];
const routingReport = routingOrdinary.map(ask => {
  const plan = buildInterviewPlan(ask, "analyze", "vi");
  return { ask, lane: plan.lane, ok: plan.lane === "ordinary" };
});

let conn = process.env.SMOKE_FORCE_OLLAMA === "1" ? null : loadConnection();
if (conn && process.env.OPENROUTER_MODEL && conn.provider === "OpenRouter") {
  conn = { ...conn, model: process.env.OPENROUTER_MODEL, source: `${conn.source}+modelOverride` };
}
if (!conn) conn = await probeOllama();

const live = [];
if (!conn) {
  console.log(JSON.stringify({
    ok: false,
    routing: routingReport,
    blocked: "No API connection found (OpenRouter env / browser key / Ollama)",
  }, null, 2));
  process.exit(2);
}

let serverUp = false;
try {
  const r = await fetch("http://127.0.0.1:3001/", { signal: AbortSignal.timeout(3000) });
  serverUp = r.ok;
} catch { serverUp = false; }
if (!serverUp) {
  console.log(JSON.stringify({ ok: false, blocked: "Server not running at 127.0.0.1:3001", connection: { provider: conn.provider, model: conn.model, key: MASK(conn.apiKey), source: conn.source } }, null, 2));
  process.exit(2);
}

for (const c of CASES) {
  const plan = buildInterviewPlan(c.ask, "analyze", c.locale);
  const started = Date.now();
  try {
    const result = await callInterview(conn, c.ask, c.locale, plan);
    const elapsedMs = Date.now() - started;
    if (!result.ok) {
      live.push({ id: c.id, ask: c.ask, ok: false, error: result.error, elapsedMs, planLane: plan.lane, seed: plan.questions.map(q => q.id) });
      continue;
    }
    const scored = scoreCase(c, result.questions);
    live.push({
      id: c.id,
      ask: c.ask,
      ok: scored.pass && result.source !== "fallback",
      source: result.source,
      elapsedMs,
      planLane: plan.lane,
      family: plan.intentFamily,
      seed: plan.questions.map(q => q.id),
      checks: scored.checks,
      questions: scored.questions,
    });
  } catch (error) {
    live.push({ id: c.id, ask: c.ask, ok: false, error: error instanceof Error ? error.message : String(error), elapsedMs: Date.now() - started });
  }
}

const passCount = live.filter(x => x.ok).length;
const report = {
  ok: passCount === live.length && routingReport.every(x => x.ok),
  connection: { provider: conn.provider, model: conn.model, key: MASK(conn.apiKey), source: conn.source },
  routingOrdinaryOk: routingReport.every(x => x.ok),
  routingOrdinary: routingReport,
  livePass: `${passCount}/${live.length}`,
  cases: live,
};

const out = join(process.cwd(), "benchmarks", "public", "MODEL_FIRST_INTERVIEW_SMOKE.json");
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
