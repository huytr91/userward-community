import test from "node:test";
import assert from "node:assert/strict";
import { POST, MAX_REQUEST_BYTES, type Provider } from "../app/api/providers/chat/route.ts";
import { buildOpenRouterAttempts } from "../app/lib/openrouter-routing.ts";

const originalFetch = globalThis.fetch;
const requestBody = (provider: Provider, model = "chosen-model") => ({
  provider,
  apiKey: provider === "Ollama" ? "" : "test-key",
  model,
  messages: [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "follow-up" },
  ],
});

test("all provider adapters preserve multi-turn conversation", { concurrency: false }, async () => {
  const cases: Array<{ provider: Provider; response: unknown }> = [
    { provider: "OpenAI", response: { output: [{ content: [{ text: "ok" }] }], usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } },
    { provider: "Anthropic", response: { content: [{ text: "ok" }], usage: { input_tokens: 3, output_tokens: 1 } } },
    { provider: "Google", response: { candidates: [{ content: { parts: [{ text: "ok" }] } }] } },
    { provider: "DeepSeek", response: { choices: [{ message: { content: "ok" } }] } },
    { provider: "Qwen", response: { choices: [{ message: { content: "ok" } }] } },
    { provider: "Kimi", response: { choices: [{ message: { content: "ok" } }] } },
    { provider: "OpenRouter", response: { model: "chosen-model", choices: [{ message: { content: "ok" } }] } },
    { provider: "Ollama", response: { message: { content: "ok" }, prompt_eval_count: 3, eval_count: 1 } },
  ];
  try {
    for (const item of cases) {
      let outbound: { url: string; body: Record<string, unknown> } | undefined;
      globalThis.fetch = async (input, init) => {
        outbound = { url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
        return Response.json(item.response);
      };
      const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody(item.provider)) }));
      assert.equal(response.status, 200, item.provider);
      assert.equal((await response.json() as { text: string }).text, "ok", item.provider);
      assert.ok(outbound, item.provider);
      const sent = outbound!.body;
      if (item.provider === "OpenAI") assert.equal((sent.input as unknown[]).length, 3);
      else if (item.provider === "Google") {
        assert.equal((sent.contents as unknown[]).length, 3);
        assert.equal(((sent.contents as Array<{ role: string }>)[1]).role, "model");
      } else assert.equal((sent.messages as unknown[]).length, 3);
      if (item.provider === "OpenRouter") assert.equal(sent.model, "chosen-model");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("route rejects oversized request before calling a provider", { concurrency: false }, async () => {
  let called = false;
  try {
    globalThis.fetch = async () => { called = true; return Response.json({}); };
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "content-length": String(MAX_REQUEST_BYTES + 1) }, body: "{}" }));
    assert.equal(response.status, 413);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("route preserves provider error status", { concurrency: false }, async () => {
  try {
    globalThis.fetch = async () => Response.json({ error: { message: "rate limited" } }, { status: 429 });
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody("OpenAI")) }));
    assert.equal(response.status, 429);
    assert.match((await response.json() as { error: string }).error, /rate limited/);
  } finally { globalThis.fetch = originalFetch; }
});

test("free-first policy blocks paid model before provider call", { concurrency: false }, async () => {
  let called = false;
  try {
    globalThis.fetch = async () => { called = true; return Response.json({}); };
    const body = { ...requestBody("OpenRouter", "openai/gpt-5"), budgetMode: "free-first" };
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(response.status, 409);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenAI stream is normalized to cancellable NDJSON deltas", { concurrency: false }, async () => {
  try {
    globalThis.fetch = async (_input, init) => {
      const sent = JSON.parse(String(init?.body)) as { stream?: boolean };
      assert.equal(sent.stream, true);
      return new Response('data: {"type":"response.output_text.delta","delta":"Xin "}\n\ndata: {"type":"response.output_text.delta","delta":"chào"}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
    };
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", body: JSON.stringify({ ...requestBody("OpenAI"), stream: true }) }));
    assert.match(response.headers.get("content-type") || "", /ndjson/);
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line) as { delta?: string; done?: boolean; started?: boolean });
    assert.equal(events[0]?.started, true);
    assert.equal(events.map(event => event.delta || "").join(""), "Xin chào");
    assert.equal(events.at(-1)?.done, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenRouter stream forwards usage into NDJSON", { concurrency: false }, async () => {
  try {
    globalThis.fetch = async (_input, init) => {
      const sent = JSON.parse(String(init?.body)) as { stream_options?: { include_usage?: boolean } };
      assert.equal(sent.stream_options?.include_usage, true);
      return new Response('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: {"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
    };
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", body: JSON.stringify({ ...requestBody("OpenRouter"), stream: true }) }));
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line) as { usage?: { totalTokens?: number }; done?: boolean });
    assert.ok(events.some(event => event.usage?.totalTokens === 15));
    assert.equal(events.at(-1)?.done, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenRouter privacy 404 is retried then returned as a completed warning turn", { concurrency: false }, async () => {
  const privacy404 = () => Response.json({ error: { message: "No endpoints available matching your guardrail restrictions and data policy. Configure: https://openrouter.ai/settings/privacy", metadata: { reasons: ["privacy_restricted"] } } }, { status: 404 });
  try {
    const calls: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (_input, init) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return privacy404();
    };
    const privacy = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody("OpenRouter", "some/model")) }));
    assert.equal(privacy.status, 200);
    const privacyBody = await privacy.json() as { text?: string; error?: string; code?: string; warning?: string };
    assert.equal(privacyBody.code, "openrouter_privacy");
    assert.equal(privacyBody.warning, "openrouter_privacy");
    assert.match(privacyBody.text || "", /không phải hết credit|guardrail|privacy/i);
    assert.equal(privacyBody.error, undefined);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.zdr, undefined);
    assert.deepEqual(calls[0]?.provider, { allow_fallbacks: true });
    assert.deepEqual(calls[0]?.models, ["openrouter/auto"]);
    assert.equal(calls[1]?.model, "openrouter/auto");
    assert.equal(calls[0]?.zdr, undefined);
    assert.equal((calls[0]?.provider as { data_collection?: unknown } | undefined)?.data_collection, undefined);

    globalThis.fetch = async () => Response.json({ error: { message: "You need more credits" } }, { status: 402 });
    const credits = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody("OpenRouter")) }));
    assert.equal(credits.status, 402);
    assert.equal((await credits.json() as { code?: string }).code, "openrouter_credits");
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenRouter privacy 404 succeeds after auto fallback", { concurrency: false }, async () => {
  try {
    const calls: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push(body);
      if (body.model === "openrouter/auto") {
        return Response.json({ model: "openrouter/auto", choices: [{ message: { content: "ok from auto" } }] });
      }
      return Response.json({ error: { message: "No endpoints available matching your guardrail restrictions and data policy." } }, { status: 404 });
    };
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody("OpenRouter", "some/model")) }));
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { text: string }).text, "ok from auto");
    assert.ok(calls.length >= 2);
    assert.equal(calls.at(-1)?.model, "openrouter/auto");
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenRouter 401 is not retried as privacy", { concurrency: false }, async () => {
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json({ error: { message: "Invalid API key" } }, { status: 401 });
    };
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody("OpenRouter")) }));
    assert.equal(response.status, 401);
    assert.equal(calls, 1);
    assert.equal((await response.json() as { code?: string }).code, "openrouter_unauthorized");
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenRouter attempt builder omits restrictive privacy filters", () => {
  const attempts = buildOpenRouterAttempts("anthropic/claude-3.5-sonnet");
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0]?.provider, { allow_fallbacks: true });
  assert.deepEqual(attempts[0]?.models, ["openrouter/auto"]);
  assert.equal(attempts[1]?.model, "openrouter/auto");
  assert.equal(JSON.stringify(attempts).includes("zdr"), false);
  assert.equal(JSON.stringify(attempts).includes("data_collection"), false);
});

test("OpenRouter analyze chat does not send privacy routing headers or body flags", { concurrency: false }, async () => {
  try {
    let headers: Headers | undefined;
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      headers = new Headers(init?.headers);
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ choices: [{ message: { content: "ok" } }] });
    };
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody("OpenRouter")) }));
    assert.equal(response.status, 200);
    assert.equal(headers?.get("HTTP-Referer"), "http://127.0.0.1:3001");
    assert.equal(headers?.get("X-OpenRouter-Title"), "Userward Local");
    assert.equal(headers?.get("X-Title"), null);
    assert.equal(body?.zdr, undefined);
    assert.equal(body?.allow_fallbacks, undefined);
    assert.deepEqual(body?.provider, { allow_fallbacks: true });
    assert.equal(body?.response_format, undefined);
    assert.equal(body?.reasoning, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test("provider timeout returns JSON 504 instead of throwing", { concurrency: false }, async () => {
  try {
    globalThis.fetch = async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    };
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody("OpenRouter")) }));
    assert.equal(response.status, 504);
    const body = await response.json() as { error: string; code?: string };
    assert.equal(body.code, "provider_timeout");
    assert.match(body.error, /quá lâu/i);
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenRouter stream timeout on first attempt falls through to auto without waiting out the full budget", { concurrency: false }, async () => {
  try {
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as { model?: string; stream?: boolean };
      if (calls === 1) {
        throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      }
      assert.equal(body.model, "openrouter/auto");
      assert.equal(body.stream, true);
      return new Response("data: {\"choices\":[{\"delta\":{\"content\":\"Xin chào\"}}]}\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    };
    const started = Date.now();
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", body: JSON.stringify({ ...requestBody("OpenRouter", "deepseek/deepseek-v4-flash-vision-exp"), stream: true }) }));
    assert.ok(Date.now() - started < 3_000);
    assert.equal(calls, 2);
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line) as { delta?: string; started?: boolean });
    assert.equal(events[0]?.started, true);
    assert.equal(events.some(event => event.delta === "Xin chào"), true);
  } finally { globalThis.fetch = originalFetch; }
});

test("stream TimeoutError is written as NDJSON instead of escaping the route", { concurrency: false }, async () => {
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({
      pull() {
        throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      },
    }), { headers: { "Content-Type": "text/event-stream" } });
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", body: JSON.stringify({ ...requestBody("OpenRouter"), stream: true }) }));
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line) as { error?: string; code?: string; started?: boolean });
    assert.equal(events[0]?.started, true);
    const timeoutEvent = events.find(event => event.code === "provider_timeout");
    assert.ok(timeoutEvent);
    assert.match(timeoutEvent?.error || "", /quá lâu/i);
  } finally { globalThis.fetch = originalFetch; }
});

test("hung upstream still emits a started event immediately", { concurrency: false }, async () => {
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({
      pull() { return new Promise(() => { /* OpenRouter accepted the stream then stalled */ }); },
    }), { headers: { "Content-Type": "text/event-stream" } });
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", body: JSON.stringify({ ...requestBody("OpenRouter"), stream: true }) }));
    assert.equal(response.status, 200);
    const reader = response.body?.getReader();
    assert.ok(reader);
    const first = await Promise.race([
      reader!.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("started event missing")), 1000)),
    ]);
    const line = new TextDecoder().decode(first.value);
    assert.match(line, /"started":true/);
    await reader!.cancel();
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenRouter privacy 404 with stream returns JSON warning without hanging", { concurrency: false }, async () => {
  try {
    globalThis.fetch = async () => Response.json({ error: { message: "No endpoints available matching your guardrail restrictions and data policy." } }, { status: 404 });
    const started = Date.now();
    const response = await POST(new Request("http://127.0.0.1/api/providers/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...requestBody("OpenRouter", "deepseek/deepseek-v4-flash-vision-exp"), stream: true }) }));
    assert.ok(Date.now() - started < 5_000);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /json/);
    const body = await response.json() as { code?: string; warning?: string };
    assert.equal(body.code, "openrouter_privacy");
    assert.equal(body.warning, "openrouter_privacy");
  } finally { globalThis.fetch = originalFetch; }
});
