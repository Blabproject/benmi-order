# Điều tra nút điều chỉnh xuất hiện trên production

Thời điểm kiểm tra: 2026-11-06 21:08:05 (Asia/Tokyo). Chỉ đọc cấu hình, lịch sử deployment và source đang phục vụ; không deploy, revert, sửa database hoặc cấu hình.

## Kết luận

Các nút 調整/移除 trong giỏ hàng đã tồn tại trong source main trước task lịch sử đơn và đặt lại đơn. Bản sửa căn hàng mới của task này chưa có trên production.

Bốn file index.html, index.css, js/client-cart.js và js/client-menu.js trên production khớp SHA-256 với commit production b6b4e96c và với clean HEAD c781fbc1. Phần căn hàng mới vẫn là thay đổi chưa commit trong workspace và đã được upload trực tiếp lên staging.

## Lịch sử deployment

| Môi trường | Tạo deployment (giờ Nhật) | Deployment | Trigger |
| --- | --- | --- | --- |
| Production hiện tại | 2026-11-05 15:48:19 | a407a47e-619b-4ffc-83ee-e85473dc1c26 | github:push, main, b6b4e96c — fix(pos): initialize branding for the requested tenant |
| Staging của task này | 2026-11-05 20:25:55 | 36b2bb9d-57d4-4efc-9038-4eabdbfadf3f | ad_hoc, branch staging, workspace dirty=true |

Production deploy chỉ thay đổi POS branding và graph/test liên quan, không thay đổi client-cart.js/index.css/index.html. Pages đang bật tự deploy khi push main; không có deployment production mới hơn bản trên trong lịch sử truy vấn.

## Phân biệt source cũ và bản sửa

| Dấu hiệu | Production | Staging |
| --- | --- | --- |
| Nút 調整 cho từng phần có tùy chọn | Đã có, inline style min-height 32px | Giữ chức năng; dùng class mới |
| Nút 調整/移除 cho từng phần combo | Đã có, inline style min-height 36px | Giữ chức năng; dùng class mới |
| cart-portion-actions, layout grid và nút min-height 48px | Không có | Có |
| index.css cache-buster | 20261016_option_alignment_v1 | 20261105_cart_portion_actions_v1 |
| client-cart.js cache-buster | 20261101_payment_new_cart_v4 | 20261105_cart_portion_actions_v1 |
| Script và nút lịch sử đơn mới trong index.html | Không có | Có |

Source production của nút thường ở production-js__client-cart.js:704; nút combo ở dòng 784. git blame quy các dòng này về bf19f78e6 và 9c031c806, không phải task hiện tại. Tác giả các commit ghi ngày 27/09/2026; commit đã rebase ngày 26/10/2026. Ngày tác giả không được coi là ngày deploy production đầu tiên.

- [Commit nút điều chỉnh món](https://github.com/Thuanmai56/benmi-order/commit/bf19f78e6de16d138455011b332a3bccff36ceb8)
- [Commit bố cục nút combo](https://github.com/Thuanmai56/benmi-order/commit/9c031c806d5ef6947bd581e09c90a747d8130ca9)
- [Commit production hiện tại](https://github.com/Thuanmai56/benmi-order/commit/b6b4e96c607f90f6eb27c17b182c0ab3e81b9210)

## Bằng chứng kèm theo

- pages-history.json: cấu hình project được lọc bỏ thông tin nhạy cảm và 20 deployment mới nhất.
- source-comparison.json: hash file production đối chiếu Git.
- live-assets.json: so sánh asset giữa production Pages, custom order domain và staging.
- historical-and-api-proof.json: asset của deployment trước staging và phản hồi API hiện tại.
- button-blame.txt: nguồn commit của các dòng render nút.

Các đường dẫn không tồn tại trên Pages có thể trả index.html HTTP 200. Vì vậy phản hồi 200 cho /js/client-order-history.js không được xem là bằng chứng script có trên production; response thực tế có cùng hash với index.html.

## Giới hạn

Kết luận áp dụng cho nút 調整/移除 của giỏ hàng trên benmi-order.pages.dev và order.blabfood.app. Chưa kiểm tra URL, cache hoặc DOM đang mở trên thiết bị của người báo; nếu họ đang thấy chính layout mới 48px thì cần đối chiếu URL đó riêng.

## Bổ sung: mốc phát hành bộ nút hiện tại lên production

Đối chiếu 75 production deployment từ 11/10/2026 đến 05/11/2026 và source của hai deployment liền kề quanh cutover:

- Trước: deployment d4d650c3, commit 6cc0e248, hoàn tất 26/10/2026 16:46:11 giờ Nhật: có nút chỉnh combo cũ, chưa có nút chỉnh từng phần món lẻ và chưa có nút xóa từng phần combo.
- Sau: deployment 21b9667b, commit 171b50a88cdd56887dc6ef86e7a58006b570bd90 (Merge branch staging into main), hoàn tất 27/10/2026 01:39:30 giờ Nhật: có đầy đủ các nút hiện đang được hỏi. Cloudflare ghi nhận trigger github:push, nhánh main.
- Tải trực tiếp client-cart.js của cả hai immutable deployment đều khớp hash với source commit tương ứng.

Vì vậy bộ nút chỉnh/xóa hiện tại đã lên production trong lần merge staging vào main ngày 27/10/2026, không phải deployment staging của task lịch sử đơn ngày 05/11. Ngày 27/09 là ngày tác giả commit, không phải mốc phát hành production. Nút chỉnh combo riêng lẻ đã tồn tại trước cutover này.

Chi tiết: first-production-buttons.json, production-history-extended.json.
