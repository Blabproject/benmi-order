# Lịch sử đơn hàng và đặt lại

Tính năng phục vụ khách trên trang thực đơn, trong LINE LIFF và trình duyệt đã đăng nhập LINE. Lịch sử luôn thuộc một tài khoản LINE trong một quán; lịch sử quản lý của POS tiếp tục là luồng riêng.

## Luồng khách hàng

1. Mở **Lịch sử đơn** ở đầu trang thực đơn.
2. Xem danh sách từ mới đến cũ và tải thêm khi cần.
3. Mở một đơn để xem trạng thái, thời gian, tổng tiền gốc, món và tùy chọn đã mua.
4. Chọn **Đặt lại** để đối chiếu với thực đơn hiện tại.
5. Xem trước món có thể thêm, thay đổi giá, món hết bán và lựa chọn cần chọn lại.
6. Chọn thêm vào giỏ hoặc thay giỏ, sau đó tiếp tục thanh toán thông thường.

Đặt lại chỉ tạo bản nháp giỏ hàng. Thao tác này không gửi đơn, thanh toán hoặc gửi tin nhắn LINE. Việc đóng màn hình, hủy thao tác hoặc tải thất bại không được xóa giỏ đang có.

## Dữ liệu lịch sử và dữ liệu bán hiện tại

- Chi tiết lịch sử giữ tên, giá và tùy chọn tại thời điểm bán. `OrderDetailSnapshot` là nguồn chính khi có.
- Đơn cũ thiếu dữ liệu có cấu trúc vẫn hiển thị thông tin lưu được; nội dung văn bản không được suy diễn thành lựa chọn chắc chắn.
- Đặt lại đối chiếu ID món với menu hiện tại. Chỉ dùng tên và danh mục cũ khi xác định được một kết quả duy nhất.
- Giá bán, phụ thu, tình trạng còn bán và giới hạn số lượng phải theo cấu hình hiện tại.
- Tùy chọn bị xóa, không còn hợp lệ hoặc mới trở thành bắt buộc phải được báo rõ. Không âm thầm thay bằng một lựa chọn mặc định.
- Mã đơn, mã thao tác, phiên thanh toán, số bàn và lịch nhận của đơn cũ không được chuyển sang đơn mới.
- Khi thêm vào giỏ đang có, dữ liệu tùy chọn và ghi chú của từng phần phải đi cùng số lượng tương ứng.

## Quyền truy cập

- Trình duyệt gửi access token ngắn hạn của LIFF qua header `Authorization`.
- Worker kiểm tra token với LINE, đối chiếu channel và hạn dùng, rồi lấy danh tính trực tiếp từ LINE.
- Mọi truy vấn đơn áp dụng đồng thời `tenant_id` và người dùng đã xác thực. Chi tiết đơn còn phải khớp khóa đơn.
- Không dùng ID người dùng do trình duyệt khai báo làm bằng chứng đăng nhập.
- API chỉ trả những trường phục vụ khách. Không trả bí mật thanh toán hoặc thông tin nội bộ của nhân viên.
- Phản hồi lịch sử riêng tư dùng `Cache-Control: no-store`; token và lịch sử không được đưa vào bộ nhớ cache dùng chung.

Khách chưa đăng nhập được hướng dẫn đăng nhập LINE. Đơn khách vãng lai không gắn với tài khoản LINE sẽ không xuất hiện trong lịch sử tài khoản.

## Tương tác với các luồng khác

Khách vẫn xem được lịch sử trong lúc sửa đơn, gọi thêm món hoặc có phiên thanh toán đang xử lý. Áp dụng đặt lại bị chặn trong các trạng thái này để tránh trộn hai thao tác.

Màn hình dùng bố cục ưu tiên điện thoại, điều khiển tối thiểu 48px, hỗ trợ vùng an toàn, đóng bằng Escape và quản lý focus trong hộp thoại. Toàn bộ nội dung mới có bản dịch `zh-TW` và `vi`.

## API và nguồn dữ liệu

Các route nằm trong `benmi-worker-official/src/modules/customer-orders.ts`. Tất cả nhận `Authorization: Bearer <LIFF access token>` và tenant theo cơ chế hiện có (`X-Tenant-Id` hoặc tham số tenant).

| Route | Chức năng |
| --- | --- |
| `GET /api/customer/orders` | Lịch sử từ mới đến cũ; mặc định 10 đơn, tối đa 30 đơn mỗi trang. |
| `GET /api/customer/orders/detail?key=...` | Chi tiết một đơn thuộc đúng tài khoản và quán. |
| `POST /api/customer/orders/reorder-preview` | Đối chiếu và tính lại bản nháp, không ghi dữ liệu đơn. |

Phân trang dùng cặp `before_created_at` và `before_key` do server trả về trong `nextCursor`. Không có giới hạn lịch sử 30 ngày ở API khách hàng.

Xem trước đặt lại nhận `orderKey`, `mode` (`merge` hoặc `replace`), cùng `cartItems` và `orderSelections` hiện tại khi gộp giỏ. Giá và lựa chọn từ client đều phải qua bộ quy tắc canonical. Phản hồi gồm các món khả dụng/cần chọn lại/không khả dụng, giới hạn đã áp dụng, tổng tiền mới và cảnh báo cần kiểm tra tùy chọn chung.

`priceDetailMerchandise` và `validateDetailOrderSelections` trong `order-detail.ts` được dùng chung với luồng ghi đơn. Xem trước kiểm tra lại điều kiện tổng giỏ sau khi loại món không khả dụng, kể cả trường hợp việc loại một món khiến lựa chọn của món khác không còn đủ điều kiện.

`menuCatalogRevision` trong bootstrap giúp phát hiện menu đổi giữa lúc tính lại và tải dữ liệu để áp dụng. `repricedCartItems` trong bản xem trước cung cấp lại cấu trúc tùy chọn theo giá hiện tại cho những món đã có trong giỏ khi gộp.

## Phạm vi khôi phục tự động

- ID món đã bị xóa không được thay bằng món mới trùng tên.
- Dữ liệu legacy không có ID chỉ được ghép khi tên món và tên danh mục xác định đúng một món hiện tại.
- Nội dung chỉ có văn bản được giữ để xem lại; khách được hướng dẫn chọn món khi không đủ thông tin để khôi phục lựa chọn một cách chắc chắn.
- Khôi phục tự động dùng menu Unified và hợp đồng chi tiết đơn phiên bản 1. Màn hình lịch sử vẫn phục vụ việc đối chiếu nội dung cũ.
- Đặt lại tự động xử lý tối đa 200 dòng lịch sử và 3.000 phần trong một bản nháp. Phần bị giới hạn phải có cảnh báo. Danh sách lịch sử vẫn tải tiếp bằng phân trang.
- Chi tiết legacy trả tối đa 1.000 dòng có cấu trúc; nội dung văn bản gốc được giữ để đối chiếu.

## Migration

`0079_customer_order_history_index.sql` bổ sung chỉ mục `(tenant_id, user_id, created_at DESC, key DESC)` cho bảng `orders`. Migration không sửa nội dung đơn hàng. Chỉ mục phục vụ hiệu năng; API sử dụng các bảng và trường dữ liệu đã có.
