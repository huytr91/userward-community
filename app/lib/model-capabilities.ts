export type ModelCapability = {
  id: string;
  text: boolean;
  image: boolean;
  pdf: boolean;
  structuredOutput: boolean;
  streaming: boolean;
  contextTokens: number;
};

export function inferModelCapability(provider: string, id: string, modalities: string[] = []): ModelCapability {
  const name = id.toLowerCase();
  const nonText = /(?:embedding|embed|moderation|rerank|audio|realtime|transcrib|speech|tts|image-only|vision-only)/.test(name);
  const image = modalities.includes("image") || /(?:vision|vl|gpt-4o|gpt-4\.1|gpt-5|gemini|claude-3|claude-sonnet-4|kimi-k2\.5|qwen.*vl)/.test(name);
  const pdf = provider === "OpenRouter" || modalities.includes("file");
  const structuredOutput = !/(?:openrouter\/free|pro$)/.test(name) && provider !== "Ollama";
  const contextTokens = /(?:gpt-5|gemini|claude|kimi|qwen|deepseek)/.test(name) ? 128_000 : 32_000;
  return { id, text: !nonText, image, pdf, structuredOutput, streaming: !/pro$/.test(name), contextTokens };
}

export function validateModelRequest(capability: ModelCapability, attachments: Array<{ mime: string }>, execute: boolean): string | null {
  if (!capability.text) return "Model đã chọn không hỗ trợ chat văn bản.";
  if (attachments.some(item => item.mime.startsWith("image/")) && !capability.image) return "Model đã chọn không hỗ trợ ảnh đầu vào.";
  if (attachments.some(item => item.mime === "application/pdf") && !capability.pdf) return "Model đã chọn không hỗ trợ PDF đầu vào.";
  if (execute && !capability.structuredOutput) return "Model đã chọn không hỗ trợ output có cấu trúc an toàn cho Execute.";
  return null;
}
