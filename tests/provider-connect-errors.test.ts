import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/providers/test/route.ts";
import {
  classifyProviderFetchError,
  estimateStreamEtaSeconds,
  isOpenRouterPrivacyRestriction,
  mapOpenRouterHttpError,
  ollamaNoModelsError,
  PROVIDER_STREAMING_WALL_MS,
  PROVIDER_TOTAL_TIMEOUT_MS,
  providerRoundTripTimeoutMs,
  STREAM_IDLE_TIMEOUT_MS,
} from "../app/lib/provider-connect-errors.ts";
import { translate } from "../app/lib/i18n.ts";

const originalFetch = globalThis.fetch;

const postTest = (provider: string) =>
  POST(new Request("http://127.0.0.1/api/providers/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey: provider === "Ollama" ? "" : "test-key" }),
  }));

test("connection refused to Ollama is 503 not generic interruption", () => {
  const classified = classifyProviderFetchError(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), { name: "TypeError" }), "Ollama");
  assert.equal(classified.status, 503);
  assert.equal(classified.code, "ollama_not_running");
  assert.match(classified.error, /127\.0\.0\.1:11434/);
  assert.doesNotMatch(classified.error, /tạm gián đoạn|phản hồi ổn định/);
});

test("OpenRouter privacy/guardrail 404 is not treated as missing credit", () => {
  const mapped = mapOpenRouterHttpError(404, "No endpoints available matching your guardrail restrictions and data policy. Configure: https://openrouter.ai/settings/privacy");
  assert.equal(mapped.code, "openrouter_privacy");
  assert.match(mapped.error, /không phải hết credit/i);
  assert.match(mapped.error, /openrouter\.ai\/settings\/privacy/);
  assert.equal(mapOpenRouterHttpError(402, "Payment required").code, "openrouter_credits");
  assert.equal(mapOpenRouterHttpError(401, "Unauthorized").code, "openrouter_unauthorized");
  assert.equal(isOpenRouterPrivacyRestriction("openrouter_privacy"), true);
});

test("Ollama timeout is 504 and empty catalog is 422", () => {
  const timedOut = classifyProviderFetchError(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }), "Ollama");
  assert.equal(timedOut.status, 504);
  assert.equal(timedOut.code, "ollama_timeout");
  assert.equal(ollamaNoModelsError.status, 422);
  assert.equal(ollamaNoModelsError.code, "ollama_no_models");
});

test("streaming keeps a long wall and 4-minute idle silence", () => {
  assert.equal(STREAM_IDLE_TIMEOUT_MS, 4 * 60_000);
  assert.equal(PROVIDER_TOTAL_TIMEOUT_MS, 60_000);
  assert.equal(PROVIDER_STREAMING_WALL_MS, 30 * 60_000);
  assert.equal(providerRoundTripTimeoutMs(true), PROVIDER_STREAMING_WALL_MS);
  assert.equal(providerRoundTripTimeoutMs(false), PROVIDER_TOTAL_TIMEOUT_MS);
  assert.equal(estimateStreamEtaSeconds({ receivedChars: 10, elapsedMs: 100 }), null);
  const eta = estimateStreamEtaSeconds({ receivedChars: 200, elapsedMs: 2000, targetChars: 800 });
  assert.ok(eta != null && eta >= 1);
});

test("localized Ollama copy stays specific in Vietnamese and English", () => {
  assert.equal(translate("vi", "ollamaNotRunning"), "Ollama chưa chạy trên máy này (127.0.0.1:11434).");
  assert.equal(translate("en", "ollamaNotRunning"), "Ollama is not running on this device (127.0.0.1:11434).");
  assert.doesNotMatch(translate("vi", "ollamaNotRunning"), /tạm gián đoạn/);
  assert.doesNotMatch(translate("en", "providerUnstable", { provider: "Ollama" }), /127\.0\.0\.1/);
});

test("test route maps Ollama fetch failures to distinct statuses", { concurrency: false }, async () => {
  try {
    globalThis.fetch = async () => {
      throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), { name: "TypeError" });
    };
    const refused = await postTest("Ollama");
    assert.equal(refused.status, 503);
    assert.equal((await refused.json() as { code: string }).code, "ollama_not_running");

    globalThis.fetch = async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    };
    const timedOut = await postTest("Ollama");
    assert.equal(timedOut.status, 504);
    assert.equal((await timedOut.json() as { code: string }).code, "ollama_timeout");

    globalThis.fetch = async () => Response.json({ models: [] });
    const empty = await postTest("Ollama");
    assert.equal(empty.status, 422);
    assert.equal((await empty.json() as { code: string }).code, "ollama_no_models");

    globalThis.fetch = async () => new Response("not-json", { status: 502 });
    const badJson = await postTest("Ollama");
    assert.equal(badJson.status, 502);
    assert.match((await badJson.json() as { error: string }).error, /dịch vụ tạm thời/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
