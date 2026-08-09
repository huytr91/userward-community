type Provider = "OpenAI" | "Anthropic" | "Google";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  try {
    const { provider, apiKey } = await request.json() as { provider?: Provider; apiKey?: string };
    if (!provider || !apiKey?.trim()) return json({ error: "Thiếu provider hoặc API key." }, 400);

    let response: Response;
    if (provider === "OpenAI") {
      response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey.trim()}` } });
    } else if (provider === "Anthropic") {
      response = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": apiKey.trim(), "anthropic-version": "2023-06-01" } });
    } else if (provider === "Google") {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`);
    } else return json({ error: "Provider chưa được hỗ trợ." }, 400);

    const data = await response.json() as { data?: Array<{ id?: string }>; models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>; error?: { message?: string } };
    if (!response.ok) return json({ error: data.error?.message || "API key không hợp lệ hoặc tài khoản chưa có quyền truy cập." }, response.status === 429 ? 429 : 401);

    let model = "";
    if (provider === "OpenAI") {
      const ids = (data.data || []).map(x => x.id || "");
      model = ["gpt-5.6-sol", "gpt-5.6", "gpt-5.4-mini", "gpt-4.1-mini"].find(x => ids.includes(x)) || ids.find(x => /^gpt-/.test(x)) || "";
    } else if (provider === "Anthropic") {
      model = (data.data || []).map(x => x.id || "").find(x => x.includes("sonnet")) || data.data?.[0]?.id || "";
    } else {
      model = (data.models || []).find(x => x.supportedGenerationMethods?.includes("generateContent") && x.name?.includes("flash"))?.name?.replace("models/", "") || "";
    }
    if (!model) return json({ error: "Đăng nhập hợp lệ nhưng không tìm thấy model tạo văn bản khả dụng." }, 422);
    return json({ ok: true, provider, model });
  } catch {
    return json({ error: "Không thể kết nối provider. Hãy kiểm tra mạng và API key." }, 500);
  }
}
