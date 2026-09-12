import test from "node:test";
import assert from "node:assert/strict";
import { inferHandIntent, parseHandsBlock, looksLikeHandGoal, isHandIntent, runBrowserHand } from "../app/lib/hands.ts";
import { POST as postHands } from "../app/api/hands/route.ts";

test("folder actions stay in this app, not another port", () => {
  assert.equal(looksLikeHandGoal("liệt kê file trong thư mục dự án"), true);
  assert.equal(inferHandIntent("liệt kê file trong thư mục dự án"), "workspace.list");
  assert.equal(isHandIntent("workspace.patch"), true);
  assert.equal(isHandIntent("gmail.send"), false);
});

test("desktop RPA stays a small optional intent without a foreign port", () => {
  assert.equal(inferHandIntent("mở power automate và lấy data từ outlook về"), "desktop.rpa");
  const result = runBrowserHand("desktop.rpa", { filePaths: [], attachmentNames: [], hasPendingPatch: false, executeMode: false });
  assert.equal(result.available, false);
  assert.doesNotMatch(result.message, /3000/);
  assert.match(result.message, /cannot open Power Automate/i);
});

test("uw-hands fence is the dispatch contract", () => {
  const text = "I will list the folder after you confirm.\n```uw-hands\n{\"action\":\"run\",\"intent\":\"workspace.list\"}\n```\n";
  const command = parseHandsBlock(text);
  assert.deepEqual(command, { action: "run", intent: "workspace.list", payload: {} });
});

test("workspace list returns evidence from this session", () => {
  const result = runBrowserHand("workspace.list", { folderName: "demo", filePaths: ["src/a.ts", "README.md"], attachmentNames: [], hasPendingPatch: false, executeMode: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.evidence, ["src/a.ts", "README.md"]);
});

test("hands API stays on loopback and allowlists intent", async () => {
  const blocked = await postHands(new Request("http://example.com/api/hands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "workspace.list" }) }));
  assert.equal(blocked.status, 403);
  const invalid = await postHands(new Request("http://127.0.0.1:3001/api/hands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "gmail.send" }) }));
  assert.equal(invalid.status, 400);
});
