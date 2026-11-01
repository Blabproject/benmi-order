# LINE Pay v4 — vận hành và nghiệm thu

Triển khai cục bộ, tắt mặc định. Chưa có credential merchant được cung cấp trong phiên này; chưa gọi LINE Pay thật, chưa apply migration hoặc deploy remote. Các test tự động dùng SQLite và provider giả lập; kiểm thử Chromium/WebKit không thay thế ứng dụng LINE trên thiết bị.

## Cấu hình và phát hành

1. Dùng Node 24. Chạy `npm run test:payments`, `npm run check`, `npm run --prefix benmi-worker-official check`, kiểm tra cache-buster và release baseline.
2. Apply migration `0075_line_pay_v4.sql` qua script migration `cf` hiện có, theo thứ tự dev → staging → production. Migration bổ sung bảng và guard, không tự bật tenant.
3. Chuẩn bị khóa chủ ngẫu nhiên 32 byte base64. Cung cấp Worker secret `PAYMENT_SECRET_KEYS` dưới dạng JSON `{"v1":"<base64>"}` qua kênh secret của môi trường; không lưu plaintext trong git, command argument hoặc log. `BUILD_ENVIRONMENT` phải đúng dev/staging/production. Keyring giữ các phiên bản cũ đến khi hết giao dịch cần xử lý.
4. Công cụ `node scripts/provision-linepay.mjs` nhận JSON từ stdin với tenantId, environment, mode (sandbox/production), channelId, channelSecret, masterKey, keyVersion và returnUrl. Công cụ chỉ in SQL chứa secret đã mã hóa. Truyền stdin từ secret manager/file riêng ngoài repo; không đặt literal secret trong history shell. Kiểm tra SQL và apply bằng công cụ D1 của dự án.
5. returnUrl là HTTPS menu của tenant trên frontend hiện tại (ví dụ domain cấu hình của quán và path `/`). Merchant phải được duyệt cho Online API v4/TWD. Dùng sandbox trong dev/staging. Dùng chính ID connection, không sửa channel/secret trực tiếp khi còn giao dịch; tạo revision connection mới và giữ bản cũ cho đối soát.
6. Đổi PIN mặc định trước khi mở payment. Kiểm thử credential, callback và quyền refund trong sandbox rồi mới đặt enabled=1 trên connection của đúng tenant/environment. UI đọc `/api/payments/config` no-store, không cần đổi cache bootstrap. Một connection được bật cho mỗi tenant/environment; việc đổi connection thực hiện trong transaction.
7. Khi có incident, đặt enabled=0 để chặn giao dịch mới. Không xóa connection, master key hoặc bảng. Cron vẫn phải chạy mỗi phút để hoàn tất các giao dịch cũ. Không rollback về backend chưa có processor khi còn giao dịch đang xử lý.

## API và quyền truy cập

Tất cả API cần tenant_id hoặc X-Tenant-ID; tất cả phản hồi payment no-store.

- GET `/api/payments/config`: khả năng công khai; enabled chỉ cho giao dịch mới, configured giúp giữ công cụ POS khi tắt tính năng.
- POST `/api/payments/linepay/request`: payload checkout detailVersion=1, operationId, dining_option=takeaway; header X-Payment-Token là capability 256 bit hex do client lưu trước POST. Cùng operationId phải cùng payload; token LINE là tùy chọn, không lưu trong payment. Backend tính lại giá và xác minh token/channel trước khi nhận userId cho receipt.
- POST `/api/payments/:id/confirm`, GET `/api/payments/:id`: capability cùng payment hoặc staff bearer token đúng tenant. Không nhận amount/transaction ID quyết định từ callback.
- GET `/api/payments/session`: kiểm tra phiên POS hiện hành trước khi dùng lại token; phiên hết hạn/thu hồi trả 401, PIN mặc định trả 409 `PAYMENT_PIN_CHANGE_REQUIRED`. POS yêu cầu đăng nhập lại khi phiên hết hạn.
- POST `/api/payments/session`: PIN hiện hành của đúng tenant/môi trường, trả staff bearer token. Sai PIN trả 401; PIN đúng nhưng vẫn là mặc định trả 409 với hướng dẫn thiết lập PIN riêng. Tối đa 10 lần/phút/tenant; token sống 8 giờ, xác minh PIN hiện hành khi dùng, thu hồi qua staff session hiện có.
- POST `/api/payments/:id/refunds`: staff bearer, operationId và reason bắt buộc; backend hoàn toàn bộ số tiền đã thu. Không đổi trạng thái phục vụ, không tự hoàn khi từ chối.
- GET `/api/payments/attention`: giao dịch UNKNOWN, hoàn đang chờ/thất bại và đơn đã hủy chưa hoàn.
- GET `/api/payments/summary?date=YYYY-MM-DD`: tổng thu, hoàn và thu ròng theo ngày giao dịch UTC+8; tách khỏi báo cáo món bán.
- POST `/api/payments/:id/reconcile`: nhân viên yêu cầu tra cứu lại. Không tự lặp POST refund sau kết quả không rõ.

## Quy trình sandbox bắt buộc

- Sandbox luôn dùng paymentUrl.web, kể cả khi menu mở trong LINE; paymentUrl.app chỉ dùng cho production theo FAQ LINE Pay. Trước tiên thử bằng Safari/Chrome: chọn món, LINE Pay, đăng nhập LINE cá nhân, xác thực trên màn hình sandbox, quay lại menu, có biên lai và đúng một đơn NEW trên POS. Kiểm tra deep link trên thiết bị thật khi merchant production sẵn sàng.
- Safari/Chrome: cùng luồng, back/reload, tab mới. Khách quay lại một browser context không có capability được hướng dẫn về cửa sổ đặt món ban đầu; backend vẫn đối soát, không nhận callback URL làm quyền truy cập payment.
- Xác minh thời hạn màn hình thực tế và kết quả hết hạn trong thị trường/merchant đang dùng. Không thêm đồng hồ 10–20 giây. Help Center nêu 20 phút nhưng không hardcode để kết luận tiền chưa thu.
- Quán bấm nhận, hoàn tất và giao đơn đã thu; từ chối hiển thị chưa hoàn. Nút hoàn mở modal có số tiền và lý do. Hoàn xong chỉ đổi trạng thái tiền.
- So sánh tổng thu/hoàn của POS, payment ledger và Merchant Center. Kiểm tra giao dịch hoàn vào ngày khác ngày thu.
- Khách đóng LINE, Worker lỗi sau Confirm, Refund mất phản hồi: cron khôi phục trạng thái, không tạo khoản thu/hoàn khác. Tắt enabled khi đang chờ vẫn hoàn tất được.

## Khi cần can thiệp

- UNKNOWN có mã REQUEST_RESPONSE_MISSING: Request mất phản hồi trước khi lưu transactionId. API chi tiết chỉ trả giao dịch đã xác nhận; không có bằng chứng chưa thu để tạo request mới tự động. Giữ đơn chờ, tra cứu Merchant Center bằng provider_order_id; không xóa payment để ép retry.
- REFUND_PENDING/UNKNOWN sau POST refund: chỉ tra cứu lại, không POST lần hai. Nếu provider không trả bằng chứng đủ rõ, đối chiếu Merchant Center trước khi can thiệp.
- REFUND_FAILED (ví dụ hết thời hạn hoàn): nhân viên xử lý qua merchant support/biện pháp phù hợp và lưu audit vận hành. Không sửa trực tiếp status thành REFUNDED để che sai lệch; cần bằng chứng và quy trình đối soát trước khi đóng sự cố.
- Danh sách attention giới hạn 100 giao dịch; kiểm tra ledger/query theo tenant nếu backlog lớn. Cron xử lý tối đa 12 bản ghi/lượt, concurrency 4 và backoff đến 1 giờ; theo dõi backlog trước khi tăng tải.
- Theo dõi payment_events, UNKNOWN quá 5 phút, đơn đã thu chưa phát hành, refund pending và receipt outbox. Không bật thêm tenant khi còn mismatch chưa giải thích được.

## Giới hạn bản đầu

Đơn mang đi mới, TWD nguyên dương, không sửa giá/gọi thêm với đơn LINE Pay, không hoàn một phần, không offline. Client giữ checkout chưa xác minh trong localStorage cùng origin để phục hồi; checkout đã trả tiền được dọn khi mở lại menu hoặc bắt đầu giỏ mới, phản hồi cũ không ghi đè phiên mới; không lưu access token LINE. Tenant chưa có connection dùng tiền mặt như trước. Chỉ mở pilot thật sau khi các bước sandbox và đối chiếu ở trên đạt.
