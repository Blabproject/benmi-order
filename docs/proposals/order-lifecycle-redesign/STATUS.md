# Lifecycle redesign — implementation status

Ngày 2026-11-14. Base: main/dev `2e5028e2`. Production không thay đổi.

## Đã hoàn thành trong mốc khởi đầu

- Thu hồi migration thử nghiệm 0088/0089 trên D1 Dev, gồm 14 trigger, summary view, bảng active và hai migration tracking entries. Không tái sử dụng số 0088/0089 cho ý nghĩa mới.
- Lưu toàn bộ 83 baseline events vào `withdrawn_lifecycle_events_20261114`, tách FK để việc xóa đơn sau này không làm mất bằng chứng. Snapshot local ở `/tmp/benmi-dev-withdrawn-lifecycle-backup.json` (quyền 0600).
- So sánh hash đầy đủ orders/payments trước/sau: không thay đổi. Bằng chứng aggregate ở DEV_WITHDRAWAL.json. Không tạo khoản thu/hoàn hoặc gửi LINE.
- Code domain policy mới: `src/domain/order-lifecycle.ts`. Canonical COMPLETED, mapping legacy không suy tiền, pending-action/payment gates, refund không xóa completed service, manual receipt yêu cầu xác nhận rõ.
- 9 nhóm test policy đạt. Backend TypeScript check đạt.

## Chưa triển khai

Policy mới chưa nối vào router, SQL writer hoặc UI, và chưa deploy. Dev Worker hiện còn binary foundation cũ; API lifecycle có readiness check nên view đã gỡ sẽ không được đọc. Đây không phải nghiệm thu toàn bộ redesign hoặc hoàn thành R1. Chưa đổi schema đơn sang canonical và chưa thay giao diện.

Bước tiếp theo: command storage + CAS/idempotency, POS session authority cho cả legacy, rồi chuyển đồng bộ writer orders/staff/LINE/payment và guard DB; sau đó nối UI và nghiệm thu Dev. Không đưa một route mới vào hoạt động trong khi writer cũ còn có thể bỏ qua invariant.

Chính sách thu thủ công chưa được người dùng xác nhận: mặc định thiết kế không tự ghi receipt từ việc giao món. Command có thể hỗ trợ explicit confirm_manual mà không mặc định bật auto-confirm. Tài liệu PDP là đích thiết kế, không phải danh sách chức năng đã phát hành.

## Kiểm tra

- `npm run test:lifecycle-policy`
- `npm run --prefix benmi-worker-official check`
- SQL rollback đã rehearsal trên SQLite dùng một lần với toàn bộ schema; baseline count được lấy từ dữ liệu fixture thực tế, không giả định chỉ một hàng.
- Không chạy full release gate vì chưa PR/deploy; không có sửa JS/CSS frontend nên không cần cache-buster.

Tham chiếu triển khai tiếp: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) và [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). Cần test CAS abort cả batch trước khi nối command service.

## Mốc command service đang triển khai (goal: confidence release >90%)

Lượt tiếp theo có tiến triển code thực; chưa triển khai 0090 ra remote.

- Thêm draft migration 0090: lưu raw legacy status trước chuyển đổi; canonical status nằm trực tiếp ở orders.status để chỉ có một nguồn chuẩn. Đây là đơn giản hóa so với phương án thêm cột order_state trong PDP, không thay đổi ý nghĩa domain. Cần đồng bộ writer/reader trước rollout, không apply file riêng lên remote.
- Lưu command/replay hash, completion và receipt/refund thủ công; guard tenant/revision/payment/pending action/session tại commit, terminal data và event bất biến. Baseline completed không tạo tiền hoặc thời điểm hoàn tất giả.
- Command API đã nối router. POS session mới không phụ thuộc staff-ordering; session revoke/expiry/PIN hash và rate-limit login.
- Chuyển enum order ở backend/reader và POS sang READY/COMPLETED/CANCELLED; giữ payment PAID nguyên nghĩa. UI hoàn tất dùng command có auth/revision/operation ID; cache buster đã cập nhật. Request mất phản hồi giữ ID để thử lại.
- Hoàn LINE Pay không gửi lại POST sau PROCESSING/UNKNOWN; khi xác nhận hoàn thành công, đơn chưa giao thành CANCELLED và đơn COMPLETED giữ nguyên. Thêm lease fence cho refund commit.
- Tests mới: policy, command transaction/concurrency/replay, POS session, UI command VM, refund recovery. Trước khi báo kết quả cuối phải đọc log thực của lần chạy mới nhất.

Còn phải làm trước đánh giá >90%: gom pending change/cancel và LINE callbacks vào action/revision/ownership boundary; outbox side effects; hoàn thiện settlement UI/projection, báo cáo chính xác/quyền đọc; cập nhật các fixture/test cũ sang contract mới; kiểm chứng browser + APK và staging; rehearsal migrations/rollback production. Chưa chạy full gate vì implementation còn đang thay đổi; không coi các tests mới là bằng chứng các gate còn lại đã đạt. Không có deployment hoặc Production mutation trong lượt này.

Các mục “chưa nối router/UI” ở phần mốc khởi đầu là lịch sử; phần này là tiến độ mới hơn. Toàn bộ redesign vẫn đang thực hiện.
