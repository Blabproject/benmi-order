# Staff ordering — Theo dõi release và xác nhận

## Cập nhật 29/10/2026

Người dùng đã yêu cầu tích hợp toàn bộ WIP, giữ nghiệp vụ và sửa UI theo production, sau đó force-push `dev` và migrate database dev. Phạm vi này thay thế quy trình dừng sau từng R-task cho lần tích hợp này. Các dòng R00–R25 phía dưới là lịch sử; xem [báo cáo tích hợp và runbook](./rebase-main-20261029.md) cho trạng thái mới. PR #77/R02 đã merge vào main. Chưa có tenant nào được cho phép bật capability trong lần đồng bộ này.

## Quy tắc thực hiện (lịch sử)

- Làm đúng một task mỗi lượt; dừng sau báo cáo để người dùng xác nhận kết quả và task kế tiếp.
- Chưa có xác nhận thì không bắt đầu task tiếp theo.
- Push/merge có thể gây deploy. Trình thay đổi cụ thể trước khi xin xác nhận các thao tác ngoài máy local: push, merge, deploy, migration, thay đổi cờ và xử lý đơn.
- Mỗi task code lấy từ `main` mới nhất; chỉ trích phần cần thiết từ `origin/staff_dine_in`.
- Chỉ mở rollout cho tenant ID thực tế **`blab_demo`**; mọi capability mới mặc định đóng.
- Không tự thay đổi hai đơn staff staging đang mở hoặc cờ staging ngoài demo.

## Lịch sử xác nhận

| Ngày JST | Nội dung | Trạng thái |
| --- | --- | --- |
| 19/10/2026 | Người dùng yêu cầu bắt đầu, làm từng task và luôn có người dùng xác nhận | Cho phép R00 |
| 19/10/2026 | R00 khảo sát hiện trạng và chuẩn bị báo cáo local | Đã khảo sát; người dùng cho phép chuyển sang R01 |
| 19/10/2026 | Người dùng: “bắt đầu R01” | Cho phép chuẩn bị baseline kiểm thử/checklist local |
| 19/10/2026 | R01: cài sạch dependency, baseline 17/17 suite đạt, chuẩn bị CI/checklist | Phần local hoàn tất; chờ người dùng xác nhận. CI GitHub chưa chạy |
| 19/10/2026 | Người dùng: “pussh nhánh” | Cho phép commit/push nhánh `codex/staff-order-r01-baseline`; chưa cho phép tạo PR hoặc merge |
| 19/10/2026 | Người dùng tự tạo PR #74 và thông báo trong chat | PR vào `main` đã mở; không có xác nhận merge |
| 19/10/2026 | CI Ubuntu lần đầu: 16/17 suite đạt; test legacy thiếu commit do shallow checkout | Chuẩn bị sửa `fetch-depth: 0` local; 19 ca order identity đạt lại; chờ xác nhận push bản sửa |
| 19/10/2026 | Người dùng: “push” sau khi xem bản sửa checkout | Cho phép commit/push checkout fix và theo dõi CI của PR #74; chưa merge hoặc chuyển R02 |
| 19/10/2026 | Người dùng: “kiểm tra lại và bắt đầu merge” | Đã đồng bộ PR #75, kiểm thử lại, squash merge PR #74 tại `f31de7f`; CI sau merge và deploy production thành công |
| 20/10/2026 | Người dùng yêu cầu tiếp theo R02, sau đó “continue” | Cho phép chuẩn bị R02 local từ main mới nhất; chưa push, deploy hoặc apply migration từ xa |
| 22/10/2026 | Người dùng: “commit và push” | Cho phép commit/push R02 đã chuẩn bị và theo dõi kiểm tra tự động; chưa tạo PR, merge, deploy thủ công hoặc apply migration |
| 22/10/2026 | R02 commit/push `9394433`; người dùng tạo PR #77 vào dev rồi xác nhận đổi sang main | Đã đổi base main; baseline local và workflow_dispatch 18/18 đạt. Check pull_request cũ vẫn đỏ; người dùng xác nhận commit/push tài liệu để kích hoạt CI PR mới |

## Danh sách task

| Task | Nội dung | Trạng thái |
| --- | --- | --- |
| R00 | Schema, ledger, tenant, cờ, dữ liệu staff, deploy, mốc rollback | Đã khảo sát; người dùng cho phép R01 |
| R01 | Baseline hồi quy, test POS và release checklist | Đã merge PR #74 tại `f31de7f`; CI main 17/17 và production deploy thành công; lỗi preview dev vẫn là mục riêng |
| R02 | Schema capability mặc định đóng | Đã push `9394433`, PR #77 vào main; local/dispatch 18/18 đạt; đã được duyệt push tài liệu để chạy lại check PR. Chưa merge/apply |
| R03 | Guard tập trung và API capabilities | Chưa bắt đầu |
| R04 | Đăng nhập/đăng xuất staff | Chưa bắt đầu |
| R05 | Thu hồi session khi đổi PIN | Chưa bắt đầu |
| R06 | API đọc bàn | Chưa bắt đầu |
| R07 | API tạo bàn | Chưa bắt đầu |
| R08 | API sửa/ngừng bàn | Chưa bắt đầu |
| R09 | Metadata staff trên danh sách/lịch sử đơn | Chưa bắt đầu |
| R10 | Chặn đường sửa đơn staff không hợp lệ | Chưa bắt đầu |
| R11 | Migration revision guard | Chưa bắt đầu |
| R12 | API cập nhật trạng thái staff có revision | Chưa bắt đầu |
| R13 | POS xử lý trạng thái staff qua API mới | Chưa bắt đầu |
| R14 | Kiểm tra món và giá từ server | Chưa bắt đầu |
| R15 | API tạo đơn, quyền create đóng | Chưa bắt đầu |
| R16 | Trang đăng nhập/xem bàn | Chưa bắt đầu |
| R17 | Giao diện quản lý bàn/lối vào POS | Chưa bắt đầu |
| R18 | Catalog/tùy chọn/giỏ hàng, chưa gửi đơn | Chưa bắt đầu |
| R19 | Gửi đơn mới, mở demo sau kiểm chứng | Chưa bắt đầu |
| R20 | API gọi thêm, quyền append đóng | Chưa bắt đầu |
| R21 | Giao diện gọi thêm, mở demo sau kiểm chứng | Chưa bắt đầu |
| R22 | Thông báo POS cho staff | Chưa bắt đầu |
| R23 | In tự động đơn staff mới | Chưa bắt đầu |
| R24 | In tự động từng lượt gọi thêm | Chưa bắt đầu |
| R25 | Đối soát và kết thúc rollout chỉ-demo | Chưa bắt đầu |

Các việc phát sinh từ R00 cần task riêng trước release runtime: chốt auto-deploy backend theo `cf`; xử lý chênh lệch migration/schema; chốt dữ liệu và cờ staging. Chưa có việc nào được phép thực hiện chỉ nhờ xác nhận R00/R01.

Chi tiết và bằng chứng: [r00-inventory.md](./r00-inventory.md).

Kết quả R01: [r01-baseline.md](./r01-baseline.md). Checklist áp dụng cho từng task: [release-checklist.md](./release-checklist.md).

CI lần đầu và bản sửa chờ duyệt: [r01-ci-check.md](./r01-ci-check.md).

R02: [schema và kiểm chứng](./r02-capability-schema.md), [runbook apply từng môi trường](./r02-apply-runbook.md).

R02 CI: [nguyên nhân, kết quả và check PR còn chờ](./r02-ci-check.md).
