type Provider = "OpenAI" | "Anthropic" | "Google";
const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  try {
    const { provider, apiKey, model, prompt } = await request.json() as { provider?: Provider; apiKey?: string; model?: string; prompt?: string };
    if (!provider || !apiKey || !model || !prompt?.trim()) return json({ error: "Thiếu thông tin để gửi yêu cầu." }, 400);
    let response: Response;
    if (provider === "OpenAI") response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: prompt.trim(), max_output_tokens: 1200 }) });
    else if (provider === "Anthropic") response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt.trim() }] }) });
    else response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt.trim() }] }], generationConfig: { maxOutputTokens: 1200 } }) });

    const data = await response.json() as Record<string, any>;
    if (!response.ok) return json({ error: data?.error?.message || "Provider từ chối yêu cầu." }, response.status);
    let text = "";
    if (provider === "OpenAI") text = data.output_text || data.output?.flatMap((x: any) => x.content || []).map((x: any) => x.text || "").join("") || "";
    else if (provider === "Anthropic") text = data.content?.map((x: any) => x.text || "").join("") || "";
    else text = data.candidates?.[0]?.content?.parts?.map((x: any) => x.text || "").join("") || "";
    if (!text) return json({ error: "Provider không trả về nội dung văn bản." }, 502);
    return json({ text });
  } catch {
    return json({ error: "Không thể gửi yêu cầu tới provider." }, 500);
  }
}
