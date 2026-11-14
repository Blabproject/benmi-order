# Bản Đồ Chỉ Mục Codebase (Codebase Architecture & Symbol Map)

Tài liệu này giúp AI Agent định vị **tức thì** file và hàm cần đọc/sửa theo từng màn hình và luồng nghiệp vụ mà **không cần chạy nhiều lệnh `grep` mò mẫm**.

> [!IMPORTANT]
> **Quy Tắc Tái Sử Dụng Context & Không Search Lặp Lại (Zero Redundant Search)**:
> 1. **Tận dụng tối đa Context sẵn có**: Khi vị trí file, tên hàm hoặc dòng code đã xuất hiện ở các lượt trước trong cuộc hội thoại (hoặc đã có trong bảng chỉ mục dưới đây), **CẤM chạy lại `grep` hoặc tìm kiếm lại từ đầu**. Hãy đọc/sửa trực tiếp ngay vào dòng mục tiêu.
> 2. **Ưu tiên Sửa Nhanh / Tối Giản (Surgical Edits)**: Khi người dùng yêu cầu sửa nhanh/gấp hoặc bật/tắt UI, thực hiện thay đổi ngắn gọn, trực diện nhất tại đúng điểm đích, không tự ý mở rộng phạm vi phân tích sang các module không cần thiết.

---

## 1. Kiến Trúc Tải File & Phạm Vi Biến (Global Scope Architecture)

Hệ thống Frontend chạy thuần Vanilla JS (không bundler), chia sẻ hàm qua `window.*` theo đúng thứ tự thẻ `<script>`:

### A. Trang Thực Đơn Khách Hàng (`index.html` — Mobile / LINE LIFF First)
Thứ tự load trong `index.html` (từ dòng ~966):
0. [`js/client-pricing-wasm.js`](file:///Users/duccao/Documents/benmi-order/js/client-pricing-wasm.js) (~50 dòng):
   - **`window.PricingWasm`**: Nạp module Rust WebAssembly (`wasm/pricing-engine/pricing_wasm.js` + `.wasm`) bất đồng bộ, tính toán giỏ hàng, combo bundle và validation tùy chọn món với tốc độ microsecond. Tự động fallback về JS thuần nếu WASM chưa tải xong hoặc trình duyệt cũ.
1. [`js/client-core.js`](file:///Users/duccao/Documents/benmi-order/js/client-core.js) (~1,640 dòng):
   - Khởi tạo LIFF, tải `/api/tenant/bootstrap`, quản lý `bootstrapData`, `cart`, `customizeData`, `storeConfig`.
   - `getEffectiveItemModifierGroups(catSlug, origName)`: Lấy nhóm tùy biến của món (nếu `targetItem.unifiedOptions === true` thì trả về `[]` để nhường quyền cho Unified Option Groups).
   - `resolveCatalogItem(cartKey)`: Tra cứu thông tin món từ `cartKey` (`<catSlug>_<itemName>`).
2. [`js/client-menu.js`](file:///Users/duccao/Documents/benmi-order/js/client-menu.js) (~625 dòng):
   - `renderDynamicCatalog()`: Render danh mục món ăn, badge hết hàng, nút `+` / `客製化`.
   - `renderCustomizationsPanel()` / `toggleFlavorSubOptions()`: Tùy chọn toàn đơn; phần con nằm trong `.flavor-option-container` ngay dưới lựa chọn cha. Popup món dùng `drawGroup()` trong `client-option-groups.js` với cùng quan hệ cha/con.
3. [`js/client-customizations.js`](file:///Users/duccao/Documents/benmi-order/js/client-customizations.js) (~1,085 dòng):
   - Modal tùy biến món truyền thống (`openItemCustomizeModal`, `initPortionDefaults`, `calculatePortionExtra`).
   - Lưu lựa chọn vào `customizeData[cartKey][portionIdx]` (`single`, `multiple`, `selectedDetails`, `note`).
4. [`js/client-option-groups.js`](file:///Users/duccao/Documents/benmi-order/js/client-option-groups.js) (~855 dòng):
   - **`window.UnifiedOptions`**: Bộ cấu hình món chuẩn mới (Schema v2/v3 - Unified Option Groups & Bundles).
   - Lưu lựa chọn vào `window.bundleCartData[cartKey][portionIdx]`.
5. [`js/client-bundle.js`](file:///Users/duccao/Documents/benmi-order/js/client-bundle.js) & [`js/bundle-builder-v2.js`](file:///Users/duccao/Documents/benmi-order/js/bundle-builder-v2.js):
   - Modal chọn combo/bundle thế hệ cũ (`openBundleBuilderModal`).
6. [`js/client-cart.js`](file:///Users/duccao/Documents/benmi-order/js/client-cart.js) (~940 dòng):
   - `updateQty(category, origName, change)`: Tăng/giảm số lượng món, kiểm tra mở modal bắt buộc.
   - `editCartPortion(category, origName, index)` / `removeCartPortion(...)`: Chỉnh/xóa từng phần của mọi món trong giỏ; đồng bộ tùy chọn, ghi chú và số lượng trên thẻ món.
   - `updateTotal()`: Tính tổng tiền giỏ hàng, kiểm tra điều kiện ngưỡng (`minOrderSubtotal` auto-promote), và render drawer `#cart-summary`.
7. [`js/order-detail-view.js`](file:///Users/duccao/Documents/benmi-order/js/order-detail-view.js) (~73 dòng - Shared Browser & Worker):
   - **`OrderDetailView`**: Pure contract hiển thị `detailSnapshot` (`schemaVersion === 1`): `isSnapshot`, `choices`, `lines`, `printItems`, `globalChoices`, `notes`, `text`.
8. [`js/order-detail-checkout.js`](file:///Users/duccao/Documents/benmi-order/js/order-detail-checkout.js) (~73 dòng):
   - **`DetailCheckout`**: Đóng gói payload chuẩn `detailVersion: 1` (`prepare`, `items`, `selections`, `setContext`, `register`).
9. [`js/client-checkout.js`](file:///Users/duccao/Documents/benmi-order/js/client-checkout.js) (~2,680 dòng):
   - `resolveOptionDisplayName(val)`: Tra cứu mã ID tùy chọn sang tên hiển thị.
   - `formatOrderTextMessage()` & `formatAppendItemsOnlyText()`: Tạo chuỗi text đơn hàng.
   - `buildStructuredCartItems()`: Tạo mảng `items` gửi lên API `/api/orders`.
   - `initEditOrderMode()`: Khôi phục đơn hàng khi khách sửa đơn (`?edit_order=...`) hoặc gọi thêm món (`?append_order=...`).
   - `submitOrder()`: Gửi đơn hàng lên Worker và fallback gửi tin nhắn LINE LIFF.

---

### B. Bảng Quản Lý Đơn Hàng POS (`orders.html` — Tablet / iPad First)
Thứ tự load trong `orders.html` (từ dòng ~2788):
1. [`js/orders-i18n.js`](file:///Users/duccao/Documents/benmi-order/js/orders-i18n.js) (~3,165 dòng):
   - Từ điển đa ngôn ngữ `I18N["zh-TW"]`, `I18N["vi"]`, hàm `t(key, params)` và `applyLanguageToDOM()`.
2. [`js/orders-core.js`](file:///Users/duccao/Documents/benmi-order/js/orders-core.js) (~1,450 dòng):
   - `initTenantBranding()`: Tải `/api/tenant/bootstrap`, lưu cache `localStorage`, khởi tạo `window.posOptionIdMap` qua `updatePosOptionIdMap(data)`.
   - `parsePortionCustomizations(rawText)`: Bóc tách tùy chọn theo từng phần (`第1份`, `第2份`) và dịch ID qua `posOptionIdMap`.
   - `shortItems(orderOrContent)`: Tạo chuỗi tóm tắt danh sách món gọn gàng (dùng cho thẻ Lịch sử đơn hàng).
   - `fetchOrders()` & SSE connection: Đồng bộ danh sách đơn hàng thời gian thực.
3. [`js/order-legacy-adapter.js`](file:///Users/duccao/Documents/benmi-order/js/order-legacy-adapter.js) (~280 dòng - Shared Browser & Worker):
   - **`LegacyOrderAdapter`**: Chuyển đổi đơn hàng cũ (`order.items` / `order.content`) sang cấu trúc chuẩn để hiển thị và in (`flavors`, `globalChoices`, `receiptLines`, `items`).
4. [`js/order-detail-view.js`](file:///Users/duccao/Documents/benmi-order/js/order-detail-view.js):
   - **`OrderDetailView`**: Giải mã `order.detailSnapshot` trên POS.
5. [`js/printer-service.js`](file:///Users/duccao/Documents/benmi-order/js/printer-service.js) (~1,150 dòng):
   - **`window.PrinterService`**: Quản lý in nhiệt ESC/POS & in tem nhãn TSPL (Sunmi / Bluetooth / LAN).
   - `parseOrderItems(order, expand)`: Lấy danh sách món để hiển thị trên POS hoặc in.
   - `formatPrintOptions(value)` & `resolveOptionIdToName(val)`: Chuẩn hóa và dịch ID tùy chọn sang tên hiển thị.
   - `drawReceiptToCanvas()` & `drawItemStickerToCanvas()`: Vẽ ảnh bitmap hóa đơn và tem dán.
6. [`js/orders-live.js`](file:///Users/duccao/Documents/benmi-order/js/orders-live.js) (~1,690 dòng):
   - Render lưới thẻ đơn hàng trực tiếp (`renderAll`, `renderItemRowHtml`, `formatContentHtml`, `openReview`).
   - Thao tác nhận đơn, báo hết món, đổi giờ hẹn, hoàn tất đơn.
7. [`frontend/apps/pos/PosHistoryPanel.tsx`](file:///Users/duccao/Documents/benmi-order/frontend/apps/pos/PosHistoryPanel.tsx), [`history-bridge.tsx`](file:///Users/duccao/Documents/benmi-order/frontend/apps/pos/history-bridge.tsx), [`history-store.ts`](file:///Users/duccao/Documents/benmi-order/frontend/apps/pos/history-store.ts), [`history-model.ts`](file:///Users/duccao/Documents/benmi-order/frontend/shared/contracts/history-model.ts), [`order-formatters.ts`](file:///Users/duccao/Documents/benmi-order/frontend/shared/contracts/order-formatters.ts):
   - Tab **Lịch sử đơn hàng (30 ngày)** (React 19 + TypeScript strict + Vite): `fetchHistoryOrders()`, `renderHistory()`, `matchesHistorySearch()`, `formatPosShortItems()`.
8. [`frontend/apps/pos/PosReportsPanel.tsx`](file:///Users/duccao/Documents/benmi-order/frontend/apps/pos/PosReportsPanel.tsx), [`reports-bridge.tsx`](file:///Users/duccao/Documents/benmi-order/frontend/apps/pos/reports-bridge.tsx), [`reports-store.ts`](file:///Users/duccao/Documents/benmi-order/frontend/apps/pos/reports-store.ts), [`reports-model.ts`](file:///Users/duccao/Documents/benmi-order/frontend/shared/contracts/reports-model.ts):
   - Tab **Báo cáo doanh thu & phân tích món bán** (React 19 + TypeScript strict + Vite): `selectReportRange()`, `refreshReportData()`, `fetchReportData()`, `renderReports()`.
9. [`js/orders-menu-model.js`](../../js/orders-menu-model.js) (~328 dòng - Browser & CommonJS):
   - **`MenuEditorModel`**: `canonicalMenuSnapshot(data)`, `serializeMenuData(categories, dependencies)`, `getMenuDeletions(before, after, dependencies)`; logic dữ liệu không đọc DOM hay state toàn cục.
   - Snapshot và tính danh sách xóa không sửa đầu vào. Serializer giữ cập nhật ID/liên kết trên bản nháp; nhận callback tenant, UUID, thông báo lỗi và danh mục dùng chung từ caller.
10. [`js/orders-menu.js`](file:///Users/duccao/Documents/benmi-order/js/orders-menu.js) (~5,617 dòng) & [`js/orders-option-groups.js`](file:///Users/duccao/Documents/benmi-order/js/orders-option-groups.js) (~1,770 dòng):
   - Tab **Quản lý Thực đơn & Nhóm Tùy chọn (Unified Option Groups)** ngay trên POS.
   - `orders-menu.js` giữ wrapper dữ liệu, đồng bộ DOM, state và gọi API; các test VM nạp model trước editor bằng `loadMenuEditor(context)`.
11. [`js/orders-modals.js`](file:///Users/duccao/Documents/benmi-order/js/orders-modals.js), [`js/orders-settings.js`](file:///Users/duccao/Documents/benmi-order/js/orders-settings.js):
   - Đặt đơn tại quầy (Staff Ordering), Cài đặt quán & máy in.

---

## 2. Backend Cloudflare Worker (`benmi-worker-official/src/`)

- **Router chính**: [`src/index.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/index.ts)
- **Bootstrap & KV Cache**: [`src/modules/bootstrap.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/bootstrap.ts)
  - `getTenantBootstrap()`: Tổng hợp catalog, `optionDisplayNames`, `unifiedMenu`, lưu KV `tenant:<id>:bootstrap:v2`.
  - `invalidateBootstrapCache(tenantId, env)`: Xóa KV cache khi cập nhật menu/options.
- **Unified Option Groups Authority**: [`src/modules/option-groups.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/option-groups.ts)
  - `loadOptionCatalog()`, `effectiveGroups()`, `validateOptionSelection()`, `projectOptionRule()`, `/api/menu/options`.
- **Order Detail Snapshot (Schema v1)**:
  - [`src/modules/order-detail.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/order-detail.ts): `buildDetailRound()`, `readDetail()`, `detailProjection()`, `attachOrderDetails()`.
  - [`src/modules/order-detail-write.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/order-detail-write.ts): `writeDetailedOrder()` (xử lý `create`, `append`, `modify` có idempotency & snapshot).
- **Quản lý Đơn hàng & Legacy Flow**: [`src/modules/orders.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/orders.ts)
  - `formatItemsToText()`, `/api/orders`, `/api/orders/history-all`, `/api/order/edit-context`.
- **LINE Messaging & Flex Receipts**:
  - [`src/modules/line.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/line.ts) & [`src/modules/line/templates/order-receipt.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/line/templates/order-receipt.ts) (`buildOrderFlexMessage`).

---

## 3. Bảng Tra Cứu Nhanh Khi Debug (Quick Symptom-to-File Lookup)

| Triệu chứng / Yêu cầu | Mở ngay file này (Không cần grep) |
| :--- | :--- |
| **Lỗi chọn tùy chọn / combo trên trang khách** | `js/client-option-groups.js` (Unified) hoặc `js/client-customizations.js` (Legacy) |
| **Lỗi hiển thị giỏ hàng / tính tổng tiền / ngưỡng满額** | `js/client-cart.js` (`updateTotal`, `updateCustomizationThresholdUI`) |
| **Lỗi gửi đơn / sửa đơn / thêm món (Client)** | `js/order-detail-checkout.js` + `js/client-checkout.js` (`submitOrder`, `initEditOrderMode`) |
| **Lỗi hiển thị thẻ đơn hàng mới hoặc Modal Xem đơn (POS)** | `js/orders-live.js` (`formatContentHtml`, `renderItemRowHtml`) + `js/order-detail-view.js` |
| **Lỗi hiển thị dòng tóm tắt ở tab Lịch sử đơn (POS)** | `frontend/apps/pos/PosHistoryPanel.tsx` + `frontend/shared/contracts/order-formatters.ts` (`formatPosShortItems`) |
| **Lỗi in hóa đơn / in tem nhãn / dịch mã ID tùy chọn** | `js/printer-service.js` (`formatPrintOptions`, `parseOrderItems`) + `js/order-legacy-adapter.js` |
| **Lỗi phát hiện thay đổi (dirty), payload lưu hoặc danh sách xóa menu POS** | `js/orders-menu-model.js` (snapshot/serialize/deletions) + `js/orders-menu.js` (wrapper, DOM và gọi API) |
| **Lỗi tạo/sửa nhóm tùy chọn trên POS** | `js/orders-option-groups.js` + `benmi-worker-official/src/modules/option-groups.ts` |
| **Lỗi tin nhắn biên lai LINE Flex Message** | `benmi-worker-official/src/modules/line/templates/order-receipt.ts` |
| **Ẩn/hiện Tab Sidebar POS & Chuyển Tab (`#live`, `#menu`, `#staff-order`)** | `orders.html` (sidebar buttons) + `css/orders.css` (`.sidebar-nav-item` dùng `display: flex !important`) + `js/orders-core.js` (`VALID_POS_TABS`, `getInitialTab`, `switchTab`) |
| **Cấu hình & Quyền Staff Ordering (Nhận đơn tại bàn)** | `benmi-worker-official/src/modules/staff-access.ts` + `src/modules/staff.ts` + `js/orders-settings.js` (`checkStaffOrderingCapability`) + `js/staff-order.js` |
