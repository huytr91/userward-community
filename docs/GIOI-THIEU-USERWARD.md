# Giới thiệu Userward

## AI đứng về phía bạn

**Userward** là AI Manager được thiết kế để phục vụ người dùng, không phục vụ lợi ích của một hãng model cụ thể.

Người dùng chỉ cần mô tả kết quả muốn đạt được. Userward chịu trách nhiệm xác định thông tin nào còn thiếu, công cụ hay model nào phù hợp, dữ liệu nào thực sự cần gửi, tác vụ nên tốn bao nhiêu và hành động nào tuyệt đối không được thực hiện khi chưa có sự đồng ý.

## Ý nghĩa tên gọi

Hậu tố “-ward” mang nghĩa “hướng về”, như *forward* hoặc *homeward*. **Userward** có nghĩa mọi quyết định về model, công cụ, dữ liệu, bộ nhớ, ngân sách và thực thi đều phải hướng về quyền lợi của user.

Tên cũ **Minimum** được giữ lại cho **Minimum Context Engine** — công nghệ lựa chọn lượng context tối thiểu nhưng đủ để hoàn thành tác vụ. Userward là sản phẩm và cam kết; Minimum là một trong những cơ chế để thực hiện cam kết đó.

## Bốn nghĩa vụ với người dùng

1. **Trung thành:** không ưu tiên provider vì lợi ích thương mại; chọn phương án rẻ nhất vẫn đạt yêu cầu.
2. **Cẩn trọng:** làm rõ điểm quan trọng, ưu tiên công cụ deterministic khi phù hợp, kiểm chứng đầu ra và không tuyên bố đã làm nếu không có bằng chứng.
3. **Minh bạch:** cho biết dữ liệu nào được gửi, model/tool nào được dùng, chi phí thực tế và những gì đã hoặc chưa xảy ra.
4. **Tuân thủ quyền hạn:** không vượt mục tiêu, ngân sách, privacy policy hoặc quyền thực thi user đã xác nhận.

## Luồng hoạt động

```text
Mục tiêu của user
  → Làm rõ bằng ngôn ngữ thông thường
  → Goal Contract được xác nhận
  → Đánh giá capability và privacy
  → Chọn tool trước, model sau
  → Minimum sufficient context
  → Kế hoạch có giới hạn ngân sách
  → Xin duyệt tại điểm cần thiết
  → Thực thi và kiểm chứng
  → Receipt về bằng chứng, dữ liệu và chi phí
```

## Userward không phải gì?

Userward không chỉ là giao diện chat nhiều model, prompt optimizer hoặc một dashboard token. Điểm khác biệt là lớp quản lý thống nhất đại diện cho user khi làm việc với nhiều model, provider và công cụ.

Trước khi tiêu token, hệ thống phải trả lời được:

- Có thực sự cần dùng AI không?
- Thông tin nào là cần thiết?
- Có công cụ deterministic nào phù hợp hơn không?
- Model rẻ nhất nào vẫn vượt ngưỡng chất lượng?
- Dữ liệu nào sẽ rời khỏi thiết bị?
- Hành động nào phải được user phê duyệt?

Sau tác vụ, hệ thống phải cung cấp receipt về model/tool đã dùng, dữ liệu đã truy cập, file đã thay đổi, kiểm tra đã chạy, token/chi phí thật, fallback, retry, giới hạn và thất bại.

## Thước đo thành công

Userward không tối ưu số tin nhắn hoặc lượng token tiêu thụ. North-star metric là:

> Tỷ lệ mục tiêu của user được hoàn thành trong giới hạn chất lượng, chi phí, dữ liệu và quyền hạn đã xác nhận.

## Định vị

> **Userward is the AI manager that works for you—not for a model provider. It decides what information is needed, what tools should be used, what you should pay, and what must never happen without your approval.**

**Tagline:** AI that answers to you.

**Thông điệp tiếng Việt:** Mục tiêu của bạn. Dữ liệu của bạn. Ngân sách của bạn. Quyết định của bạn.

