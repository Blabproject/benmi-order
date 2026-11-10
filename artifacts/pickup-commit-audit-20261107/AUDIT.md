# Kiểm tra phạm vi commit 65a94af0

Commit: https://github.com/Blabproject/benmi-order/commit/65a94af0b2de04bf47c5894a20218905d564f74b

Commit cha duy nhất: `b6b4e96c607f90f6eb27c17b182c0ab3e81b9210`. Đã đối chiếu cả commit trên GitHub và Git local.

## Kết luận

Diff trực tiếp của commit có 32 file, thêm 6.574 dòng và xóa 825 dòng. Chức năng chọn giờ lấy món liên quan 5 file. Trong đó `index.html` và `index.css` bị trộn thêm nội dung ngoài phạm vi; 27 file còn lại không thuộc chức năng này. Đây là thay đổi thực sự trong commit, không phải GitHub hiển thị thêm các commit khác.

## Phân loại

- Pickup: `js/client-core.js`, `js/client-checkout.js`, `tests/test_pickup_time_picker.cjs`; phần trigger/modal/cache version trong `index.html`; phần CSS `.pickup-*` trong `index.css`.
- Lịch sử đơn khách: API mới, xác thực LIFF, preview đặt lại, index D1, refactor tính giá/validate lựa chọn, frontend lịch sử, reset detail checkout và tài liệu. Ba file lớn riêng là backend 699 dòng, JS 1.856 dòng và CSS 907 dòng. `index.html` còn thêm nút lịch sử và nạp asset lịch sử.
- Bật/tắt món POS: CSS sidebar, JS điều khiển, i18n, HTML, test và đăng ký test suite. Một phần cùng suite còn đăng ký test giữ lựa chọn khẩu vị.
- LINE/hotfix dữ liệu: xóa luồng gợi ý LIFF trong `line.ts`, seed chỉnh nhóm tùy chọn của tenant và test biên lai LINE.
- Giỏ hàng: CSS `.cart-portion-*` trong `index.css` và sửa cấu trúc HTML nút thao tác trong `js/client-cart.js`.
- Giữ khẩu vị khi menu làm mới: `client-menu.js`, test browser và codebase map.
- Ba file đồ thị Graphify sinh tự động.

Danh sách đủ 32 file và số dòng từng file nằm trong `summary.json`.

## Đối chiếu nguồn thay đổi cũ

Ba file LINE/seed/test khớp byte với commit `1c334b78`. Các file `css/orders-stock.css`, `js/orders-menu.js`, `js/orders-i18n.js`, `tests/test_stock_drawer_browser.cjs` khớp byte với commit `a28f4fde` của chức năng bật/tắt món trước đó. Vì vậy các thay đổi ngoài phạm vi không phải dependency cần thiết của pickup.

Bằng chứng phù hợp với việc nhiều thay đổi tồn đọng trong cùng workspace bị gom vào một commit. Git không lưu đầy đủ thao tác stage, nên không thể khẳng định lệnh `git add` cụ thể nào đã được dùng.

## Ảnh hưởng đến phát hành

Production hiện dùng gói có mã nguồn `a28f4fde`, lần redeploy gần nhất `561ee3e5-2b71-4c77-8fe7-0818250000cf`. Gói đó đã có sidebar bật/tắt món, chưa có UI pickup của `65a94af0`; tab đặt món đang mở vẫn nạp `client-checkout.js?v=20261103_payment_choices_v1`, dùng input date/time gốc và không có trigger/modal mới.

Không nên phát hành nguyên `main` chỉ để lấy pickup: so với bản đã phát hành `289a04c3`, `client-cart.js` trong commit này không có các hàm `editCartPortion`/`removeCartPortion`; so với `3631fc5e`, các asset option groups cũng thiếu sửa bố cục đã phát hành. Đây là độ lệch giữa các nhánh và các gói đã phát hành, không phải những dòng bị xóa trực tiếp trong diff pickup so với commit cha. Đưa nguyên cây `main` lên sẽ thay các asset đó bằng phiên bản cũ hơn.

## Patch tách để đối chiếu

Đã tạo `pickup-only.patch` chỉ gồm 5 file và thư mục `pickup-only/`. Patch áp dụng được lên commit cha `b6b4e96c`, kiểm tra whitespace đạt; unit test pickup chạy trên đúng 5 file tách ra đạt, cú pháp hai file JS đạt.

Patch này là bản tách để review, chưa phải gói deploy trên production hiện tại. Khi phát hành cần ghép phần pickup lên baseline production mới nhất để giữ các sửa giỏ hàng/options. Chưa sửa `main`, chưa rewrite history, chưa push và chưa deploy thêm trong lượt kiểm tra này.
