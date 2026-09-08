import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { detectLocale, translate, translationKeys } from "../app/lib/i18n.ts";

const vietnameseMarks = /[ăâđêôơưĂÂĐÊÔƠƯ]/;

test("detects supported browser languages", () => {
  assert.equal(detectLocale(["vi-VN", "en-US"]), "vi");
  assert.equal(detectLocale(["ja-JP"]), "ja");
  assert.equal(detectLocale(["pt-BR"]), "en");
});

test("returns localized core navigation", () => {
  assert.equal(translate("vi", "newChat"), "Chat mới");
  assert.equal(translate("de", "connectModel"), "Modell verbinden");
});

test("English catalog covers chrome and has no Vietnamese leftovers", () => {
  const chromeKeys = [
    "history", "normalChat", "stopRequest", "localPrivacy", "processing",
    "noCloud", "bindLoopback", "historyOnDevice", "disconnect", "prompt",
    "safetyRefuseTitle", "completeBriefHere", "interviewAfterSendHint", "replyHere", "filesReady",
  ] as const;
  for (const key of chromeKeys) {
    const value = translate("en", key);
    assert.ok(value.length > 0, key);
    assert.doesNotMatch(value, vietnameseMarks, key);
  }
  assert.equal(translate("en", "history"), "HISTORY & PROJECTS");
  assert.equal(translate("en", "normalChat"), "Chat");
  assert.equal(translate("en", "stopRequest"), "Stop request");
  assert.equal(translate("vi", "history"), "LỊCH SỬ & DỰ ÁN");
  assert.equal(translate("en", "filesReady", { count: 2 }), "2 files ready to create/update");
  assert.equal(translate("vi", "openRouterPrivacyTitle"), "OpenRouter chặn model vì chính sách dữ liệu");
  assert.match(translate("vi", "openRouterPrivacyMessage"), /không phải hết credit/i);
  assert.match(translate("en", "openRouterPrivacyAction"), /openrouter\.ai\/settings\/privacy/);
  assert.match(translate("vi", "openRouterPrivacyInResult"), /Cảnh báo:/);
  assert.match(translate("en", "openRouterPrivacyInResult"), /Warning:/);
  assert.match(translate("en", "policyWarningLegal"), /still asked the model/i);
  assert.match(translate("vi", "policyWarningLegal"), /vẫn đã gọi model/);
  assert.doesNotMatch(translate("en", "openRouterPrivacyInResult"), /Incomplete|credit shortage/i);
  assert.match(translate("vi", "missingFolderAction"), /Đổi folder/);
  assert.match(translate("vi", "missingFolderAction"), /Chat thường/);
  assert.match(translate("en", "missingFolderTitle"), /Chat/);
  assert.equal(translate("es", "history"), translate("en", "history"));
});

test("every English catalog value is present and not Vietnamese", () => {
  for (const key of translationKeys) {
    const value = translate("en", key);
    assert.ok(value.length > 0, key);
    assert.doesNotMatch(value, vietnameseMarks, key);
  }
});

test("page chrome uses translate keys instead of hardcoded Vietnamese labels", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /t\("history"\)/);
  assert.match(page, /t\("normalChat"\)/);
  assert.match(page, /t\("stopRequest"\)/);
  assert.match(page, /t\("localPrivacy"\)/);
  assert.match(page, /t\("settings"\)/);
  assert.match(page, /t\("savings"\)/);
  assert.match(page, /t\("processing"\)/);
  assert.match(page, /executionMode==="execute"\?t\("confirmAndRun"\):t\("send"\)/);
  assert.doesNotMatch(page, /brain-tabs/);
  assert.doesNotMatch(page, /inspect-memory/);
  assert.doesNotMatch(page, /finance-summary/);
  assert.match(page, /settingsOpen/);
  assert.match(page, /t\("disconnect"\)/);
  assert.doesNotMatch(page, /LỊCH SỬ & DỰ ÁN/);
  assert.doesNotMatch(page, />Chat thường</);
  assert.doesNotMatch(page, /Dừng yêu cầu/);
  assert.doesNotMatch(page, /Ngắt kết nối/);
  assert.doesNotMatch(page, /Userward đang xử lý yêu cầu/);
});
