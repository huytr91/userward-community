import { isHandIntent, runBrowserHand, type HandIntent } from "../../lib/hands.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  try {
    const hostname = new URL(request.url).hostname;
    if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) return json({ error: "Userward Local chỉ nhận yêu cầu từ thiết bị này." }, 403);
    const body = await request.json() as { intent?: string; payload?: Record<string, string> };
    if (!body.intent || !isHandIntent(body.intent)) return json({ error: "Intent không hợp lệ." }, 400);
    const result = runBrowserHand(body.intent as HandIntent, {
      folderName: body.payload?.folderName,
      filePaths: [],
      selectedPath: body.payload?.path,
      selectedText: "",
      attachmentNames: body.payload?.attachment ? [body.payload.attachment] : [],
      hasPendingPatch: body.payload?.pendingPatch === "1",
      executeMode: body.payload?.execute === "1",
    });
    return json(result, result.ok ? 200 : result.available ? 409 : 501);
  } catch {
    return json({ error: "Yêu cầu không hợp lệ." }, 400);
  }
}
