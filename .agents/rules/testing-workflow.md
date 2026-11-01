# Quy Chuẩn Kiểm Thử Tinh Gọn Khi Phát Triển (Tiered Testing Workflow)

Để tối ưu hóa tốc độ phản hồi (feedback loop) và tránh lãng phí thời gian chạy toàn bộ 25 suites Playwright (~2 phút) cho mỗi lần chỉnh sửa nhỏ, AI Agent và lập trình viên BẮT BUỘC tuân thủ phân cấp kiểm thử sau:

---

### Cấp 1: Kiểm thử Tức thì (Instant Feedback - Dưới 1 giây)
Áp dụng ngay sau mỗi lần chỉnh sửa file CSS/JS hoặc cấu trúc HTML:
- **Lệnh**: `npm run check` (hoặc `node scripts/check-frontend.js`)
- **Mục đích**: Phát hiện ngay lập tức lỗi cú pháp, va chạm biến toàn cục (`const`/`let`) giữa các thẻ `<script>`, và lỗi biên dịch `applyLanguageToDOM()`.

---

### Cấp 2: Kiểm thử Mục tiêu theo Module (Targeted Tests - 0.5s đến 3s)
**CẤM** chạy các bài test trình duyệt Playwright nặng (`test_*_browser.cjs`, tốn 20–40s) khi chỉ chỉnh sửa nhỏ CSS, ẩn/hiện tab hoặc sửa logic JS đơn giản. Chỉ chạy đúng file unit test nhẹ (< 1s):

Chỉ chạy test suite của đúng module vừa thay đổi:

1. **Sửa Thực đơn / Tùy chọn / Combo / Catalog**:
   - Chạy logic menu cốt lõi (in-memory SQLite, không mở trình duyệt):
     ```bash
     npm run test:new-menu
     ```
   - Hoặc file test bug fix cụ thể:
     ```bash
     node --experimental-sqlite --test tests/test_pos_menu_bug_fixes.cjs
     ```
2. **Sửa Backend Cloudflare Worker**:
   - Kiểm tra kiểu dữ liệu TypeScript:
     ```bash
     npm run --prefix benmi-worker-official check
     ```
3. **Sửa Cấu hình Quán, Domain hoặc Routing**:
   - Kiểm tra API config và domain routing:
     ```bash
     node --test scripts/test-order-domain-api.cjs scripts/test-order-domain-routing.mjs
     ```
4. **Sửa Máy in POS, Hóa đơn hoặc Thông báo LINE Flex**:
   - Kiểm tra biên lai và định dạng in:
     ```bash
     npm run test:line-order-receipts
     npm run test:print-identity
     ```
5. **Sửa Chi tiết đơn hàng (Order Details / Snapshot)**:
   - Kiểm tra snapshot schema:
     ```bash
     npm run test:order-details
     ```
6. **Sửa Điều hướng Tab POS (`switchTab`, `getInitialTab`, URL Hash)**:
   - Kiểm tra nhanh logic tab (< 0.5s, không mở trình duyệt):
     ```bash
     node --test tests/test_pos_tab_persistence.cjs
     ```

---

### Cấp 3: Menu Gate Cục bộ (Local Menu QA - Khi sửa lớn UI/Layout Menu)
Khi cần xác thực layout thực đơn nhưng không muốn chạy toàn bộ các bài test máy in/hóa đơn:
- **Lệnh**: `npm run test:menu:local` (tương đương `node scripts/check-release-baseline.mjs --menu`)

---

### Cấp 4: Full Release Baseline (Pre-Release Gate - ~115 giây)
- **Lệnh**: `npm run test:release`
- **Quy tắc**:
  - **CẤM**: Tuyệt đối không chạy `npm run test:release` sau mỗi lần sửa bug nhỏ hoặc trong lúc đang lặp nhanh (iterative development).
  - **BẮT BUỘC**: Chỉ chạy 1 lần duy nhất trước khi tạo Pull Request hợp nhất vào `dev`/`staging`/`main`, hoặc khi chuẩn bị deploy chính thức.
