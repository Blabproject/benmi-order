# Điều tra sự cố khách không đặt được đơn — zhadantongxue

Ngày kiểm tra: 06/11/2026. Mốc log đầu tiên được truy vấn đến 20:57 giờ Nhật; các phép thử trình duyệt thực hiện sau đó.

## Kết luận hiện tại

Chưa tái hiện được sự cố và chưa đủ bằng chứng xác định nguyên nhân của trường hợp quán báo. Cấu hình và menu production đang hoạt động. Các yêu cầu tạo đơn tìm thấy trong cửa sổ 24 giờ đều thành công. Cần thời điểm lỗi và biểu hiện cụ thể từ khách để nối với log hoặc tái hiện trên thiết bị tương ứng.

## Bằng chứng production

- Tenant active, `store_status=open`, `customer_order_domain=blabfood`.
- API config trả endpoint `https://order.blabfood.app/zhadantongxue`, LIFF ID `2011142254-XRns8O0k`.
- Giờ bán: thứ Hai–thứ Bảy 14:30–21:00 Đài Loan; Chủ nhật nghỉ. Cho phép đặt giờ lấy món.
- Bootstrap HTTP 200, `menuComplete=true`, `unifiedMenu=true`, `orderDetailVersion=1`. Dữ liệu lấy qua cache giống dữ liệu lấy mới bằng `nocache=1` tại thời điểm kiểm tra.
- Menu có 25 món bán trong 4 danh mục; tất cả đang còn hàng tại thời điểm kiểm tra.
- D1 ghi nhận hai đơn hôm nay và cả hai đã nhận hàng:
  - `Z1106-T001`: tạo lúc 16:01:53 giờ Nhật / 15:01:53 Đài Loan; tổng 130. Log POST `/api/create` HTTP 200, LINE iPhone, origin `order.blabfood.app`.
  - `Z1106-T002`: tạo lúc 17:49:25 giờ Nhật / 16:49:25 Đài Loan; tổng 160. Log POST `/api/create` HTTP 200, LINE Android, cùng origin.
- Truy vấn log 24 giờ theo tenant và trigger `POST /api/create` tìm thấy hai request trên, không tìm thấy request tạo đơn bị từ chối trong kết quả truy vấn.
- Có phiên iPhone/Android tải menu sau các đơn thành công; API config/bootstrap của các phiên được kiểm tra trả HTTP 200. Không thể xác định chỉ từ log rằng mỗi phiên này đã thử bấm gửi đơn.

## Tái hiện trên trình duyệt

Thử trang production với viewport 390×844, timezone Asia/Taipei, trên Chromium và WebKit. SDK LINE được giả lập trạng thái đã đăng nhập. Tất cả request ghi dữ liệu bị chặn trong trình duyệt; không tạo đơn thử và không gửi thông báo LINE.

| Món | Chromium | WebKit | Kiểm tra payload cục bộ với menu production |
| --- | --- | --- | --- |
| 原味炸蛋蔥餅, tùy chọn mặc định | Tạo được request | Tạo được request | Hợp lệ, 45 |
| 椒鹽月亮蝦餅（6小片） | Tạo được request | Tạo được request | Hợp lệ, 50 |
| 純喫茶（綠茶） | Tạo được request | Tạo được request | Hợp lệ, 25 |
| 小熱狗, danh mục có dấu gạch dưới trong slug | Tạo được request | Tạo được request | Hợp lệ, 20 |

Không có lỗi JavaScript trong 8 phép thử. Thử thêm món chính với lựa chọn không cay và không rau cũng tạo được payload hợp lệ. Payload được kiểm tra bằng `buildDetailRound` trong workspace, với các dòng menu/options đọc từ D1 production; đây không phải phép thử ghi đơn đầu cuối lên production.

Khi không chọn giờ lấy món, cả hai trình duyệt đều chặn gửi và hiện `請選擇預計取餐時間`. Vì vậy nhận định sơ bộ rằng trường hợp này không hiện thông báo đã được loại bỏ sau khi kiểm tra lại.

## Phần chưa xác minh

- Đăng nhập, quyền SDK và callback trên chính thiết bị LINE gặp sự cố.
- Món/tùy chọn/số lượng, thời điểm và nguyên văn thông báo của lần lỗi.
- Tình trạng mạng hoặc cache trên thiết bị khách.
- Báo cáo có nói tới việc không gửi được đơn hay đã gửi nhưng không nhận tin xác nhận.

Không thay đổi mã ứng dụng hoặc cấu hình/dữ liệu production trong cuộc điều tra. Chưa có bản sửa vì chưa xác định được lỗi cụ thể.

## Kiểm tra mở rộng khi không có thông tin từ khách

Theo yêu cầu chỉ điều tra, không thực hiện bản sửa hoặc triển khai.

- Chạy 58 trường hợp trên trang production với Chromium và WebKit: 25 món riêng lẻ trên mỗi trình duyệt, giỏ đủ 25 món, giỏ nhiều phần, ba phần có tùy chọn cay/rau và topping, cùng giỏ mở bằng cấu hình cũ rồi gửi sau khi nhận cấu hình mới.
- Cả 58 trường hợp tạo đúng một request, không có lỗi JavaScript. Toàn bộ request ghi bị chặn tại trình duyệt. SDK LINE tiếp tục được giả lập trạng thái đăng nhập.
- Kiểm tra cục bộ các payload bằng `buildDetailRound` với dữ liệu menu production đọc mới: 58/58 hợp lệ, tổng tiền khớp. Giỏ 25 món có tổng 1.285; giỏ ba phần thêm xúc xích cùng ba món khác có tổng 385.
- Truy vấn `/api/create` riêng từng ngày trong 7 ngày gần nhất, thay cho chỉ truy vấn một cửa sổ lớn có thể bị lấy mẫu: tìm thấy 7 request, tất cả HTTP 200; các truy vấn theo ngày báo `abr_level=1`. Chưa tìm thấy request tạo đơn bị từ chối trong kết quả này.
- Truy vấn `/api/line/client-error` theo từng ngày trong cùng khoảng: không tìm thấy event của tenant.

### Thay đổi menu quan sát được trong lúc điều tra

Log ghi nhận cập nhật `/api/menu/option-group` vào khoảng 21:07–21:09 giờ Nhật ngày 06/11. So sánh bootstrap trước/sau cho thấy cay và rau chuyển từ bắt buộc sang tùy chọn, bỏ lựa chọn mặc định; topping tối đa từ 10 thành 9. Các cập nhật này không được thực hiện bởi cuộc điều tra này. Đây là thay đổi quan sát được, chưa có bằng chứng chứng minh liên quan đến sự cố ban đầu. Phép thử giỏ giữ lựa chọn từ cấu hình cũ vẫn tạo payload hợp lệ với cấu hình mới trên cả hai trình duyệt.

### Điểm thiếu bằng chứng

Endpoint chẩn đoán LINE hiện tại chỉ ghi lỗi gửi tin nhắn xác nhận (`liff_send_message_failed`) gắn với mã đơn. Nó không cung cấp lịch sử các bước hoặc lỗi JavaScript/khởi tạo LINE trước lúc tạo đơn. Vì vậy không thể suy ra rằng khách không gặp lỗi chỉ từ việc API không ghi nhận request thất bại.

Kết luận sau kiểm tra mở rộng: chưa tái hiện được lỗi, chưa đủ bằng chứng quy nguyên nhân. Hướng thu thập bằng chứng tiếp theo là ghi nhận lỗi và giai đoạn checkout trên thiết bị khách; đây mới là đề xuất, chưa thêm mã theo dõi hay thay đổi production.
