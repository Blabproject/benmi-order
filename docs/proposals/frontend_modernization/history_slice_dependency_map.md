# Bản đồ phụ thuộc lát cắt đầu tiên: POS Order History & Read-Only Detail

Tài liệu PR 1 (khóa baseline & ranh giới phụ thuộc) dựa trên kiểm tra trực tiếp mã nguồn hiện tại trên `staging`/`main`.

---

## 1. Phạm vi & Entry Point

| Thành phần | Vị trí nguồn | Vai trò |
| :--- | :--- | :--- |
| DOM Container | [`orders.html#L434-L474`](file:///Users/duccao/Documents/benmi-order/orders.html#L434-L474) | `#view-history`, toolbar tìm kiếm/lọc, danh sách `#list-history` |
| Logic History | [`js/orders-history.js`](file:///Users/duccao/Documents/benmi-order/js/orders-history.js) (511 dòng) | Fetch `/api/orders/history-all`, lọc, gom nhóm ngày UTC+8, render accordion |
| Read-only Detail | [`js/orders-modals.js#L117-L210`](file:///Users/duccao/Documents/benmi-order/js/orders-modals.js#L117-L210) (`openReview`) | Mở chi tiết đơn lịch sử ở chế độ chỉ đọc |
| API Backend | [`getHistoryAll`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/orders.ts#L1518-L1541) + [`mapOrderRows`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/orders.ts#L1355-L1399) | Trả tối đa 1000 đơn `PICKED_UP`, `REJECTED`, `PAID` trong 30 ngày gần nhất (`ORDER BY created_at DESC`), đính kèm items, `detailSnapshot` và `payment` |

---

## 2. Hợp đồng API (`/api/orders/history-all`)

Endpoint: `GET ${WORKER_BASE}/api/orders/history-all?tenant_id=<tenantId>&_t=<ts>`

Trả về JSON array `Order[]` (khớp DTO `HistoryOrderDto` trong [`frontend/shared/contracts/api.ts`](file:///Users/duccao/Documents/benmi-order/frontend/shared/contracts/api.ts)):
- Định danh: `key`, `orderId`, `displayKey`, `legacyKey`, `businessDate`
- Khách & thời gian: `customer`, `time`, `createdAt` (epoch ms sau parse UTC), `pickedUpAt?`
- Phân loại & bàn: `diningOption` (`'dine_in' | 'takeaway'`), `tableNumber`, `tableId`, `table_id`, `source`, `revision`, `roundCount`, `round_count`, `lastAppendedAt`, `last_appended_at`, `is_modified`, `isModified`
- Nội dung & tiền: `status` (`'PICKED_UP' | 'PAID' | 'REJECTED' | 'FORCE_REJECT'`...), `total`, `content`, `note`, `reason`
- Đính kèm: `items`, `detailSnapshot` (`OrderDetailSnapshot`), `detailRevision`, `payment`

Fallback client hiện tại ([`fetchHistoryOrders`](file:///Users/duccao/Documents/benmi-order/js/orders-history.js#L165-L170)): nếu API trả rỗng, lấy các đơn `PICKED_UP | REJECTED | PAID` từ `currentOrders` trong phiên POS đang mở; cache 15 giây theo `tenantId`.

---

## 3. Phụ thuộc ngoài file `js/orders-history.js`

Khi chuyển tab History sang React ở PR 4, các phụ thuộc sau phải được cung cấp qua `shared/` hoặc adapter bridge rõ ràng:

1. **Globals đọc/gọi**:
   - `WORKER_BASE`, `getTenantIdFromUrl()`
   - `window.isDineInSupported()`, `window.currentTenantFeatures`, `window.allowDineIn`
   - `currentLang`, `window.currentLang`, `t(key, params)`
   - `OrderCode.format(code)` (`js/order-code.js`)
   - `escapeHtml(...)`, `POS_SVG`, `PaymentPOS.badge(order)`
   - [`isOrderElapsedMode`](file:///Users/duccao/Documents/benmi-order/js/orders-core.js#L587-L593), [`formatOrderSubmissionTime`](file:///Users/duccao/Documents/benmi-order/js/orders-core.js#L595-L610), [`shortItems`](file:///Users/duccao/Documents/benmi-order/js/orders-core.js#L654), [`formatPickupTimeDisplay`](file:///Users/duccao/Documents/benmi-order/js/orders-core.js#L788-L845), [`formatOrderTotal`](file:///Users/duccao/Documents/benmi-order/js/orders-core.js#L847-L858)
   - `getOrderTableNumber(order)` (`js/orders-live.js#L313`)
2. **Callbacks sang module khác (action boundary)**:
   - Click tile / nút Xem → `openReview(order.key)` (`js/orders-modals.js`)
   - Click banner >30 ngày → `openBlabContactModal('history')`
3. **DOM IDs đang gắn listener / style từ ngoài**:
   - `#view-history`, `#history-search-input`, `#btn-history-search-clear`, `#history-filter-group` (`[data-filter="all|dine_in|takeaway"]`), `#history-total-summary-badge`, `#btn-toggle-all-history`, `#btn-toggle-all-text`, `#btn-toggle-all-icon`, `#list-history`
   - I18N IDs: `#i18n-hist-filter-all`, `#i18n-hist-filter-dinein`, `#i18n-hist-filter-takeaway`
4. **Từ điển `zh-TW` & `vi` bắt buộc đủ key**:
   - `emptyHistory`, `historyTitle`, `historySub`, `historySearchPlaceholder`, `historyFilterAll`, `historyFilterDineIn`, `historyFilterTakeaway`, `historyNoSearchResults`, `historyNoSearchResultsSub`, `btnClearFilter`, `btnExpandAll`, `btnCollapseAll`, `todayTag`, `orderUnit`, `historyOlderTitle`, `historyOlderSub`, `btnContactBlab`, `badgePicked`, `badgePaid`, `badgeRejected`, `btnView`, `pickupLabel`, `dineInTimeLabel`, `badgeTakeaway`, `badgeDineIn`, `badgeAppendRound`, `badgeModifiedOrder`, `defaultCustomer`.

---

## 4. Hợp đồng hành vi phải giữ 100% (Parity Criteria)

1. **Tìm kiếm không dấu**: chuẩn hóa tiếng Việt (`removeVietnameseDiacritics`) khớp trên mã đơn (`displayKey` sau `OrderCode.format`, `key`, bỏ `#` đầu), tên khách, số bàn, SĐT, tên món (`content` + `shortItems`) và ghi chú (`note`).
2. **Lọc theo hình thức dùng bữa**: xác định nội/ngoại (`isOrderDineIn`) theo thứ tự ưu tiên: `diningOption/dining_option` → số bàn → prefix mã `-D`/`-T` → từ khóa `content` → chuỗi `time`. Tự động ẩn bộ lọc và reset về `'all'` khi tenant không hỗ trợ `dine_in`.
3. **Gom nhóm & Sắp xếp theo múi giờ UTC+8 (Đài Loan)**:
   - Nhóm theo `YYYY-MM-DD` của `order.time` (fallback `createdAt` +8h).
   - Nhóm ngày sắp mới nhất trước; đơn trong ngày sắp theo `(pickedUpAt || createdAt)` giảm dần.
   - Đắn tag `todayTag` đúng ngày hiện tại UTC+8; tính tổng `$dayTotal` từng ngày.
   - Khởi tạo mặc định mở rộng nhóm ngày đầu tiên; khi đang search hoặc filter (`!== 'all'`) tự động mở tất cả nhóm khớp (nhưng vẫn cho phép bấm đóng từng nhóm riêng biệt `collapsed_<date>`).
4. **Touch targets & UI**: các nút điều khiển tương tác trên POS giữ kích thước tối thiểu 48px (`min-height: 48px`), chạy sạch trên cả `zh-TW` và `vi`.
