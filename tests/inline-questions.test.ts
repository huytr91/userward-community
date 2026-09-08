import test from "node:test";
import assert from "node:assert/strict";
import { parseInlineQuestions } from "../app/lib/inline-questions.ts";
import { translate } from "../app/lib/i18n.ts";

const t = (key: Parameters<typeof translate>[1]) => translate("en", key);

const trading = `I infer you want a predictive trading model.

1. **Asset/market** – e.g., equities, crypto, FX, futures?
2. **Holding period** – intraday, daily, multi-day?
3. **Prediction target** – next-period return, price direction, or trade signal?
4. **Available data** – price/volume only, fundamentals, order book, alternative data?
5. **Trading constraints** – position limits, fees/slippage, max drawdown, holding rules?`;

const howTo = `Dưới đây là các bước chính:

1. **Mở Power Automate**
   - Truy cập web: https://powerautomate.com và đăng nhập.
   - Hoặc nếu dùng bản desktop, mở ứng dụng Power Automate từ Start menu.
2. **Tạo flow để lấy dữ liệu từ Outlook**
   - Chọn Create → Automated cloud flow.
   - Đặt tên flow, ví dụ “Lấy email Outlook”.
3. **Lưu và chạy thử**
   - Bấm Save, gửi một email kiểm tra.`;

test("clarifying numbered questions with ? become choice cards", () => {
  const questions = parseInlineQuestions(trading, t);
  assert.ok(questions.length >= 2);
  assert.ok(questions[0].options.some(option => /equities|crypto|FX/i.test(option) || option === t("useAiOption")));
});

test("HOWTO numbered steps do not become Send these answers", () => {
  assert.deepEqual(parseInlineQuestions(howTo, t), []);
  const englishHowTo = `Main steps:\n\n1. Open Power Automate\n   - Visit https://powerautomate.com and sign in.\n2. Create a flow to pull Outlook data\n   - Choose Create → Automated cloud flow.\n3. Save and test\n   - Click Save, then send a test email.`;
  assert.deepEqual(parseInlineQuestions(englishHowTo, t), []);
  const pad = `1. Mở ứng dụng Power Automate Desktop → chọn New flow, đặt tên, ví dụ LayAttachment.\n2. Trong action panel, tìm Outlook → thêm action Get email.\n3. Cấu hình trigger này:\n   - Folder: Inbox\n7. Nhấn Run để chạy thử.`;
  assert.deepEqual(parseInlineQuestions(pad, t), []);
});
