# 01-business.md

# Business / Kinh doanh

## 1. Khái niệm sản phẩm

Sản phẩm này là một nền tảng đặt món cho nhà hàng/quán ăn theo mô hình multi-tenant, được tích hợp với Zalo Official Account.

Nhà hàng có thể dẫn khách hàng từ Zalo tới một trang đặt món online. Khách hàng đặt món trên trang này, còn nhân viên nhà hàng xử lý đơn hàng thông qua staff dashboard. Sau khi nhân viên xác nhận hoặc từ chối đơn hàng, khách hàng sẽ nhận được kết quả thông qua Zalo.

Nền tảng được thiết kế để hỗ trợ nhiều nhà hàng trong cùng một hệ thống. Mỗi nhà hàng có menu, nhân viên, đơn hàng và cấu hình Zalo riêng.

### Decision / Quyết định sản phẩm

MVP này nhắm tới mô hình multi-tenant platform, không chỉ là một app riêng cho Benmi. Điều này có nghĩa là ngay từ đầu hệ thống cần có khái niệm tenant/restaurant, phân tách dữ liệu theo từng nhà hàng, và chuẩn bị cho nhiều cấu hình Zalo khác nhau.

### Zalo OA strategy / Chiến lược Zalo OA

Chiến lược Zalo Official Account vẫn chưa được quyết định: mỗi nhà hàng có OA riêng, hay toàn bộ platform dùng một OA chung. Đây là quyết định nền tảng vì nó ảnh hưởng tới onboarding, quyền gửi tin nhắn, chi phí, xác thực webhook, dữ liệu khách hàng và vận hành hỗ trợ.

---

## 2. Người dùng mục tiêu

### Khách hàng của nhà hàng

Những người muốn đặt món thông qua một trang mobile-friendly được mở từ Zalo.

### Nhân viên nhà hàng

Những người cần xem, xác nhận hoặc từ chối các đơn hàng mới.

### Chủ nhà hàng / Quản lý

Những người chịu trách nhiệm quản lý thông tin nhà hàng, menu, tài khoản nhân viên và tích hợp Zalo.

### Platform Admin

Người vận hành hệ thống, chịu trách nhiệm quản lý các nhà hàng, cấu hình nền tảng và xử lý các vấn đề vận hành.

---

## 3. Vấn đề cần giải quyết

Nhiều nhà hàng nhỏ đang sử dụng các ứng dụng nhắn tin như Zalo để giao tiếp với khách hàng, nhưng việc quản lý đơn hàng thường vẫn còn thủ công.

Các vấn đề thường gặp:

- Khách hàng gửi đơn hàng bằng tin nhắn tự do, dễ gây nhầm lẫn.
- Nhân viên phải tự đọc, kiểm tra và phản hồi từng đơn hàng.
- Không có trạng thái đơn hàng rõ ràng như `NEW`, `ACCEPTED`, `DONE` hoặc `REJECTED`.
- Khó quản lý menu, nhân viên, lịch sử đơn hàng trong cùng một nơi.
- Khó mở rộng cùng một hệ thống cho nhiều nhà hàng nếu không có thiết kế multi-tenant.

---

## 4. Giá trị sản phẩm

Hệ thống giúp nhà hàng nhận và xử lý đơn hàng một cách có cấu trúc hơn, trong khi vẫn sử dụng Zalo làm kênh giao tiếp với khách hàng.

Giá trị chính:

- Khách hàng có thể đặt món từ một menu rõ ràng thay vì phải nhắn tin thủ công.
- Nhân viên có thể quản lý các đơn hàng đang chờ xử lý từ một dashboard.
- Khách hàng nhận được cập nhật trạng thái đơn hàng thông qua Zalo.
- Dữ liệu của từng nhà hàng được tách biệt theo tenant, cho phép nhiều nhà hàng cùng sử dụng một nền tảng.
- Hệ thống có thể bắt đầu nhỏ và vận hành với chi phí thấp bằng Cloudflare.

---

## 5. Phạm vi MVP

Phiên bản đầu tiên nên tập trung vào các chức năng tối thiểu cần thiết để kiểm chứng business flow.

### Must-have cho first validation

- Tạo nhà hàng bởi platform admin
  - Giả định hiện tại là có khả năng cần tạo riêng Zalo OA cho từng nhà hàng. 
- Thông tin cơ bản của nhà hàng
- Quản lý menu và món ăn
- Trang đặt món cho khách hàng
- Giỏ hàng và gửi đơn hàng
- Đăng nhập riêng cho từng nhà hàng/quán
- Staff dashboard để xem đơn hàng đang chờ xử lý
- Trang chi tiết đơn hàng
- Xác nhận đơn hàng
- Từ chối đơn hàng
- Gửi tin nhắn Zalo sau khi khách hàng tạo đơn hàng
- Gửi tin nhắn Zalo sau khi nhân viên xác nhận/từ chối đơn hàng
- Log cơ bản cho message và lỗi hệ thống

### Maybe-after-first-restaurant

- Lịch sử đơn hàng cơ bản
- Quản lý nhiều nhân viên trên mỗi nhà hàng
- Tối ưu onboarding Zalo OA cho từng nhà hàng
- Cấu hình message template nâng cao
- Bộ lọc và tìm kiếm đơn hàng
- Báo cáo vận hành đơn giản
- Import/export menu
- Công cụ hỗ trợ platform admin xử lý lỗi tích hợp Zalo

### Messaging platform limits / Giới hạn nền tảng nhắn tin

Zalo là nền tảng chính cho MVP, nhưng cần kiểm tra quota, loại tin nhắn được phép gửi và chi phí theo từng loại message. Nếu sau này vẫn hỗ trợ LINE song song với Zalo, cần kiểm soát số lượng push message vì LINE có thể giới hạn số tin nhắn trong gói miễn phí hoặc gói thấp.

### Trạng thái đơn hàng trong MVP

Sử dụng cùng bộ trạng thái với technical architecture để tránh lệch giữa business doc và implementation:

- `NEW`: đơn mới được tạo, đang chờ nhân viên xử lý.
- `ACCEPTED`: nhân viên đã nhận đơn và bắt đầu chuẩn bị.
- `DONE`: đơn đã chuẩn bị xong, đang chờ khách nhận.
- `PICKED_UP`: khách đã nhận món.
- `WAITING_CUSTOMER_CHANGE`: nhà hàng cần khách xác nhận thay đổi, ví dụ đổi giờ hoặc đổi món.
- `WAITING_CUSTOMER_REJECT`: nhà hàng không thể nhận đơn và đang chờ khách xác nhận hủy hoặc phản hồi lại.
- `REJECTED`: đơn bị từ chối hoặc đã hủy.

---

## 6. Ngoài phạm vi MVP

Các chức năng sau chưa nằm trong phiên bản đầu tiên:

- Thanh toán online
- Theo dõi giao hàng
- Coupon hoặc khuyến mãi
- Quản lý tồn kho
- Phân tích doanh thu nâng cao
- Custom domain riêng cho từng nhà hàng
- Dashboard realtime bằng WebSocket
- Quản lý ca làm việc phức tạp
- Quản lý nội dung đa ngôn ngữ
- Hệ thống tài khoản khách hàng riêng ngoài Zalo
- Tích điểm / loyalty points
- Nhà hàng tự đăng ký tài khoản

Các chức năng này có thể được cân nhắc sau khi order flow cơ bản đã được kiểm chứng.

---

## 7. Giả định kinh doanh

Các giả định ban đầu:

- Người dùng đầu tiên là các nhà hàng nhỏ hoặc vừa.
- Khách hàng đã quen sử dụng Zalo để giao tiếp với nhà hàng.
- Nhà hàng chưa cần thanh toán online trong phiên bản đầu tiên.
- Nhân viên có thể xử lý đơn hàng thủ công thông qua dashboard.
- Dashboard dùng polling là đủ chấp nhận được cho MVP.
- Mỗi nhà hàng có thể có Zalo Official Account riêng.
- Hệ thống nên có chi phí vận hành thấp ở giai đoạn đầu.
- Cloudflare Pages, Workers, D1 và KV phù hợp cho MVP giai đoạn đầu.

---

## 8. Giả định chi phí

MVP nên được thiết kế để có chi phí vận hành tối thiểu.

Các khu vực chi phí chính:

- Hosting bằng Cloudflare Pages
- Request tới Cloudflare Workers
- Usage của Cloudflare D1
- Usage của Cloudflare KV
- Chi phí Zalo OA / Zalo message
- Chi phí domain nếu cần

Nguyên tắc kiểm soát chi phí:

- Dùng D1 làm source of truth cho đơn hàng.
- Chỉ dùng KV cho cache hoặc cấu hình.
- Tránh polling staff dashboard quá thường xuyên.
- Giới hạn truy vấn lịch sử đơn hàng bằng pagination.
- Không gửi các tin nhắn Zalo không cần thiết.
- Log đủ hữu ích nhưng không quá dư thừa.

---

## 9. Chỉ số thành công

Thành công của sản phẩm nên được đo bằng các chỉ số đơn giản trước.

### Chỉ số về nhà hàng

- Số lượng nhà hàng được onboard
- Số lượng nhà hàng đang hoạt động
- Số lượng nhân viên trên mỗi nhà hàng

### Chỉ số về đơn hàng

- Số lượng đơn hàng được tạo
- Số lượng đơn hàng được xác nhận
- Số lượng đơn hàng bị từ chối
- Tỉ lệ xác nhận đơn hàng
- Thời gian trung bình từ lúc tạo đơn hàng đến lúc nhân viên xác nhận/từ chối

### Chỉ số về tin nhắn

- Tỉ lệ gửi tin nhắn Zalo thành công
- Số lượng tin nhắn Zalo gửi thất bại
- Số lượng đơn hàng mà tin nhắn thất bại nhưng đơn hàng vẫn được lưu thành công

### Chỉ số sử dụng sản phẩm

- Số lượt truy cập trang đặt món
- Tỉ lệ chuyển đổi từ truy cập trang đặt món sang gửi đơn hàng
- Tần suất sử dụng staff dashboard

---

## 10. Tiêu chí kiểm chứng MVP

MVP được xem là thành công nếu:

- Có thể tạo và cấu hình một nhà hàng.
- Khách hàng có thể mở trang đặt món từ Zalo.
- Khách hàng có thể gửi đơn hàng thành công.
- Nhân viên có thể xem các đơn hàng đang chờ xử lý.
- Nhân viên có thể xác nhận hoặc từ chối đơn hàng.
- Khách hàng có thể nhận kết quả thông qua Zalo.
- Đơn hàng vẫn được lưu ngay cả khi việc gửi tin nhắn Zalo thất bại.
- Nhiều nhà hàng có thể sử dụng cùng một hệ thống mà không nhìn thấy dữ liệu của nhau.

---

## 11. Ghi chú cần review sau

Các câu hỏi cần review trước khi implementation:

- Nên dùng loại Zalo message nào cho tin nhắn tạo đơn hàng và tin nhắn xác nhận/từ chối?
- Mỗi nhà hàng cần Zalo OA riêng, hay nền tảng có thể dùng một OA chung?
- Trong MVP, chủ nhà hàng có tự quản lý menu không, hay platform admin sẽ quản lý thủ công?
- Staff dashboard nên polling bao lâu một lần?

---

## 12. Rủi ro cần theo dõi

Các rủi ro chính cần được kiểm chứng sớm:

- Zalo API permissions: cần xác nhận OA/app có quyền gửi đúng loại tin nhắn cần dùng cho order flow.
- OA ownership per tenant: nếu mỗi nhà hàng dùng OA riêng, onboarding và vận hành phức tạp hơn; nếu dùng một OA chung, trải nghiệm thương hiệu và phân tách dữ liệu cần được thiết kế kỹ.
- Message quota/cost: chi phí và giới hạn gửi tin nhắn có thể ảnh hưởng trực tiếp tới mô hình giá.
- Webhook reliability: hệ thống cần xử lý retry, duplicate event, lỗi gửi message và trạng thái đơn hàng vẫn phải được lưu ổn định.
- Staff auth: dashboard phải có xác thực và phân quyền theo tenant để tránh nhân viên nhà hàng này xem hoặc sửa dữ liệu của nhà hàng khác.
