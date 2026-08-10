type Provider = "OpenAI" | "Anthropic" | "Google" | "DeepSeek" | "Qwen" | "Kimi" | "OpenRouter";
const compatibleBases: Partial<Record<Provider, string>> = { DeepSeek: "https://api.deepseek.com", Qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", Kimi: "https://api.moonshot.ai/v1", OpenRouter: "https://openrouter.ai/api/v1" };
const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  try {
    const { provider, apiKey, model, prompt, attachments = [], maxOutputTokens = 1800 } = await request.json() as { provider?: Provider; apiKey?: string; model?: string; prompt?: string; maxOutputTokens?: number; attachments?: Array<{ name: string; dataUrl: string; mime: string }> };
    const outputLimit = Math.min(Math.max(Number(maxOutputTokens) || 1800, 200), 8000);
    if (!provider || !apiKey || !model || !prompt?.trim()) return json({ error: "Thiếu thông tin để gửi yêu cầu." }, 400);
    if (attachments.length && provider !== "OpenRouter") return json({ error: "PDF và ảnh hiện được gửi trực tiếp qua OpenRouter. Hãy chọn OpenRouter hoặc dùng file text với provider này." }, 400);
    let response: Response;
    if (provider === "OpenAI") response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: prompt.trim(), max_output_tokens: outputLimit }) });
    else if (provider === "Anthropic") response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model, max_tokens: outputLimit, messages: [{ role: "user", content: prompt.trim() }] }) });
    else if (provider === "Google") response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt.trim() }] }], generationConfig: { maxOutputTokens: 1200 } }) });
    else {
      const content = provider === "OpenRouter" && attachments.length ? [
        { type: "text", text: prompt.trim() },
        ...attachments.map(file => file.mime.startsWith("image/") ? { type: "image_url", image_url: { url: file.dataUrl } } : { type: "file", file: { filename: file.name, file_data: file.dataUrl } }),
      ] : prompt.trim();
      response = await fetch(`${compatibleBases[provider]}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(provider === "OpenRouter" ? { "HTTP-Referer": "https://minimum-ai-workspace.huy-hanoietrip.chatgpt.site", "X-OpenRouter-Title": "Minimum AI Workspace" } : {}) }, body: JSON.stringify({ model, messages: [{ role: "user", content }], max_tokens: outputLimit }) });
    }

    const data = await response.json() as Record<string, any>;
    if (!response.ok) return json({ error: data?.error?.message || "Provider từ chối yêu cầu." }, response.status);
    let text = "";
    if (provider === "OpenAI") text = data.output_text || data.output?.flatMap((x: any) => x.content || []).map((x: any) => x.text || "").join("") || "";
    else if (provider === "Anthropic") text = data.content?.map((x: any) => x.text || "").join("") || "";
    else if (provider === "Google") text = data.candidates?.[0]?.content?.parts?.map((x: any) => x.text || "").join("") || "";
    else {
      const content = data.choices?.[0]?.message?.content;
      text = typeof content === "string" ? content : Array.isArray(content) ? content.map((part: any) => typeof part === "string" ? part : part?.text || part?.content || "").join("\n") : data.choices?.[0]?.text || "";
    }
    if (!text) return json({ error: "Provider không trả về nội dung văn bản." }, 502);
    return json({ text });
  } catch {
    return json({ error: "Không thể gửi yêu cầu tới provider." }, 500);
  }
}
