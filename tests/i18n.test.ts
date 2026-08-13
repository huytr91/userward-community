import assert from "node:assert/strict";
import test from "node:test";
import { detectLocale, translate } from "../app/lib/i18n.ts";

test("detects supported browser languages", () => {
  assert.equal(detectLocale(["vi-VN", "en-US"]), "vi");
  assert.equal(detectLocale(["ja-JP"]), "ja");
  assert.equal(detectLocale(["pt-BR"]), "en");
});

test("returns localized core navigation", () => {
  assert.equal(translate("vi", "newChat"), "Chat mới");
  assert.equal(translate("de", "connectModel"), "Modell verbinden");
});
