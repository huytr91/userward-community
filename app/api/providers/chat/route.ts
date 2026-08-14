type Provider = "OpenAI" | "Anthropic" | "Google" | "DeepSeek" | "Qwen" | "Kimi" | "OpenRouter";
const compatibleBases: Partial<Record<Provider, string>> = { DeepSeek: "https://api.deepseek.com", Qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", Kimi: "https://api.moonshot.ai/v1", OpenRouter: "https://openrouter.ai/api/v1" };
const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  try {
    const hostname = new URL(request.url).hostname;
    if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) return json({ error: "Userward Local chỉ nhận yêu cầu từ thiết bị này." }, 403);
    const { provider, apiKey, model, prompt, attachments = [], maxOutputTokens = 1800, executionMode = "analyze" } = await request.json() as { provider?: Provider; apiKey?: string; model?: string; prompt?: string; executionMode?: "analyze" | "execute"; maxOutputTokens?: number; attachments?: Array<{ name: string; dataUrl: string; mime: string }> };
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
      response = await fetch(`${compatibleBases[provider]}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(provider === "OpenRouter" ? { "HTTP-Referer": "http://127.0.0.1:3000", "X-OpenRouter-Title": "Userward Local" } : {}) }, body: JSON.stringify({ model, messages: [{ role: "user", content }], max_tokens: outputLimit, ...(provider === "OpenRouter" && model !== "openrouter/free" ? { reasoning: { effort: "low", exclude: true }, ...(executionMode === "execute" ? { response_format: { type: "json_object" } } : {}) } : {}) }) });
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
    if (!text) {
      const finish = data.choices?.[0]?.finish_reason;
      const reasoning = data.choices?.[0]?.message?.reasoning;
      return json({ error: model === "openrouter/free" ? "Free Router không tìm được model phù hợp để tạo project patch. Hãy thử lại hoặc chọn chế độ trả phí; app chưa tạo hay sửa file nào." : reasoning ? "Model chỉ trả reasoning nhưng không tạo nội dung cuối. Hãy thử lại hoặc chọn model hỗ trợ JSON tốt hơn." : `Provider không tạo nội dung cuối${finish ? ` (finish: ${finish})` : ""}. Hãy thử lại hoặc đổi model.` }, 502);
    }
    const usage = data.usage ? { promptTokens: Number(data.usage.prompt_tokens || data.usage.input_tokens || 0), completionTokens: Number(data.usage.completion_tokens || data.usage.output_tokens || 0), totalTokens: Number(data.usage.total_tokens || 0), cost: Number(data.usage.cost || 0) } : undefined;
    return json({ text, usage, selectedModel: data.model || model });
  } catch {
    return json({ error: "Không thể gửi yêu cầu tới provider." }, 500);
  }
}
