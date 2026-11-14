# PDP: Kiến Trúc Đa Ngôn Ngữ LIFF & Thực Đơn Đa Ngôn Ngữ (AI Seeding + POS Editor) [New]

## 1. Executive Summary & Objectives

### Problem Statement
Hiện tại, giao diện đặt món của khách hàng trên LINE LIFF (`index.html` và các module `js/client-*.js`) đang hardcode phần lớn chuỗi giao diện bằng tiếng Trung Phồn Thể (`zh-TW`), chỉ có một vài nhánh kiểm tra lẻ tẻ (`locale === 'vi'`). Đồng thời, dữ liệu thực đơn trong Cloudflare D1 (`menu_categories`, `menu_items`, `modifier_groups`, `modifier_options`) chỉ lưu một trường `name` duy nhất theo ngôn ngữ gốc của quán.

Khi mở rộng nền tảng cho khách nước ngoài (sử dụng Tiếng Anh `en`, Tiếng Việt `vi`, hoặc Tiếng Trung `zh-TW`), khách hàng gặp rào cản lớn khi đọc menu và các tùy chọn món (độ cay, đá/đường, combo đi kèm).

### Goals (In-Scope)
1. **Track 1 — Đa ngôn ngữ Giao diện Tĩnh (Static UI I18N trên LIFF)**:
   - Tách toàn bộ chuỗi tĩnh trên `index.html` và `js/client-*.js` sang bộ từ điển chuẩn `js/client-i18n.js` (`zh-TW`, `en`, `vi`, mở rộng được).
   - Cung cấp bộ chuyển đổi ngôn ngữ (Language Switcher) tối giản trên Header LIFF, tự động nhận diện ngôn ngữ từ LINE LIFF (`liff.getLanguage()`), trình duyệt, hoặc lựa chọn đã lưu của khách mà **không làm mất giỏ hàng hiện tại**.
2. **Track 2 — Đa ngôn ngữ Thực đơn Động (Dynamic Menu I18N cho Tenant mới)**:
   - Mở rộng schema D1 và KV Bootstrap (`i18n_json`) theo cấu trúc JSON map mở rộng được (`Record<Locale, LocalizedFields>`), ưu tiên hỗ trợ ngay **`zh-TW` (Tiếng Trung Phồn Thể)** và **`en` (Tiếng Anh)** (cùng `vi` khi cần).
   - **Tương thích ngược 100% (Zero Backfill cho Tenant cũ)**: Các tenant cũ chưa có dữ liệu dịch tự động fallback về tên gốc (`name`, `description`, `badge_text`) mà không cần migrate dữ liệu.
   - **Seeding tự động bằng AI**: Cập nhật Master Prompt (`gemini_menu_extractor_prompt.md`) và skill `tenant-menu-seeder` để tự động dịch chuẩn thuật ngữ F&B sang Tiếng Anh / Tiếng Trung ngay khi trích xuất ảnh menu quán mới.
   - **Thiết lập thủ công + AI hỗ trợ trên POS (`orders.html`)**: Bổ sung khung nhập đa ngôn ngữ gọn nhẹ (collapsible section) kèm nút **"Dịch tự động bằng AI"** trong trình sửa Món, Danh mục và Nhóm tùy chọn trên POS.
   - **Bảo toàn Ngôn ngữ Bếp & Hóa đơn**: POS (`orders.html`) và máy in nhiệt (`printer-service.js`) luôn hiển thị tên gốc của quán để bếp làm món chính xác; biên lai LINE Flex (`order-receipt.ts`) và màn hình xác nhận LIFF của khách hiển thị song ngữ hoặc theo ngôn ngữ khách chọn.

### Non-Goals (Out-of-Scope)
- Không bắt buộc dịch lại dữ liệu thực đơn của các tenant cũ đang chạy ổn định (trừ khi chủ quán bấm dịch trên POS).
- Không thay đổi tên món gốc dùng làm định danh nội bộ trong `order_detail_snapshots` hay bộ tính giá Rust WASM (`benmi-pricing-rs`).

---

## 2. Context & Current Architecture

- **Frontend LIFF (`index.html`, `js/client-*.js`)**:
  - Đang lưu giỏ hàng theo key `${catSlug}_${item.name}` trong `window.cart`, `window.customizeData`, `window.bundleCartData`.
  - Khi gửi đơn qua [`js/order-detail-checkout.js`](file:///Users/duccao/Documents/benmi-order/js/order-detail-checkout.js), client chỉ gửi ID (`itemId`, `groupId`, `optionId`, `subOptions[].id`).
- **Backend Worker (`benmi-worker-official/src/`)**:
  - [`src/modules/bootstrap.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/bootstrap.ts) tổng hợp dữ liệu menu vào KV `tenant:<id>:bootstrap:v2`.
  - [`src/modules/option-groups.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/option-groups.ts) quản lý Unified Option Groups (Schema v3) và đã có sẵn cột `labels_json` trên bảng `modifier_groups`.
  - [`cloudflare.config.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/cloudflare.config.ts) quản lý toàn bộ bindings cho 3 môi trường (`dev`, `test`/`staging`, `production`), hỗ trợ khai báo native binding `AI: bindings.ai()` của **Cloudflare Workers AI** (`env.AI.run(...)`) mà không cần API key bên thứ 3.
- **POS Menu & Option Group Editor (`orders.html`)**:
  - [`js/orders-menu.js`](file:///Users/duccao/Documents/benmi-order/js/orders-menu.js) và [`js/orders-option-groups.js`](file:///Users/duccao/Documents/benmi-order/js/orders-option-groups.js) quản lý chỉnh sửa Danh mục, Món ăn và Nhóm tùy chọn.

---

## 3. Proposed Architecture

### 3.1. Nguyên Tắc Cốt Lõi: Tách Biệt Định Danh Gốc (Canonical Identity) & Nhãn Hiển Thị (Localized Label)

> [!IMPORTANT]
> **Quy tắc bất biến**: Đổi ngôn ngữ trên LIFF **chỉ thay đổi tầng hiển thị (Presentation Layer)**, tuyệt đối không thay đổi `item.name` hoặc `option.name` dùng trong `cartKey` (`${catSlug}_${item.name}`) hay `order_detail_snapshots`.

```mermaid
flowchart TD
    subgraph Onboarding_and_POS["1. Khởi Tạo & Quản Lý Menu"]
        Seeder["AI Menu Extractor Prompt\n+ tenant-menu-seeder"] -->|Seed SQL| D1[(Cloudflare D1\nname + i18n_json)]
        POS["POS Menu Editor\n(orders.html)"] -->|Nhập tay hoặc bấm\n'Dịch tự động bằng AI'| TranslateAPI["POST /api/menu/ai-translate\n(Cloudflare Workers AI: env.AI)"]
        TranslateAPI -->|JSON i18n| POS
        POS -->|PUT /api/menu/options| D1
    end

    subgraph Edge_Runtime["2. Edge Runtime & Cache"]
        D1 -->|Invalidate & Warm| KV[(KV: bootstrap:v2\nBOOTSTRAP_VERSION = 6)]
        KV -->|GET /api/tenant/bootstrap| LIFF["LIFF Client (index.html)"]
    end

    subgraph Customer_and_Kitchen["3. Hiển Thị Khách Hàng vs. Bếp"]
        LIFF -->|UI Tĩnh: client-i18n.js\nMenu Động: locText(entity, field, locale)| CustomerView["Màn hình Khách (zh-TW / en / vi)"]
        CustomerView -->|Submit Order:\nitemId + optionId + customerLocale| OrderAPI["POST /api/orders\n(order-detail-write.ts)"]
        OrderAPI -->|Canonical Snapshot\n(Ngôn ngữ gốc của quán)| KitchenPOS["POS & Máy In Nhiệt\n(100% Ngôn ngữ gốc)"]
        OrderAPI -->|Song ngữ / Theo customerLocale| LineFlex["Biên lai LINE Flex Message\n(order-receipt.ts)"]
    end
```

---

### 3.2. Thiết Kế Chi Tiết Track 1: Đa Ngôn Ngữ Tĩnh trên LIFF (Static UI I18N)

#### A. Module Từ Điển `js/client-i18n.js`
- Tạo file mới [`js/client-i18n.js`](file:///Users/duccao/Documents/benmi-order/js/client-i18n.js) (nạp ngay trước `js/client-core.js` trong `index.html`).
- Cấu trúc từ điển `window.CLIENT_I18N`:
  - Hỗ trợ `zh-TW` (繁體中文), `en` (English), `vi` (Tiếng Việt).
  - Cung cấp hàm `ct(key, params)` (Client Translate) và `locText(entity, field, fallback)`:
    ```javascript
    function locText(entity, field = 'name', fallback = '') {
        if (!entity) return fallback;
        const locale = window.currentLocale || 'zh-TW';
        const localized = entity.i18n?.[locale]?.[field];
        if (localized && String(localized).trim() !== '') return String(localized).trim();
        return entity[field] ?? fallback;
    }
    ```
- **Thứ tự ưu tiên xác định ngôn ngữ (`resolveInitialClientLocale(tenant)`)**:
  1. Tham số URL `?lang=en|zh-TW|vi` (nếu có).
  2. Lựa chọn khách đã bấm lưu trong `localStorage.getItem('benmi_client_locale')`.
  3. Ngôn ngữ từ LINE LIFF (`liff.getLanguage()`) hoặc `navigator.language` (chuẩn hóa `zh*` -> `zh-TW`, `en*` -> `en`, `vi*` -> `vi`).
  4. Mặc định theo `tenant.locale` (`zh-TW`).

#### B. Bộ Chuyển Đổi Ngôn Ngữ (Minimalist Language Switcher)
- Đặt nút chọn ngôn ngữ nhỏ gọn ở góc trên bên phải của `.store-header-top` trong [`index.html`](file:///Users/duccao/Documents/benmi-order/index.html) (tuân thủ `ui-design-principles.md`: dùng icon SVG quả địa cầu nét mảnh 2.0px, không dùng cờ emoji rườm rà):
  - Hiển thị dạng pill gọn: `🌐 繁中 | EN | VI` (hoặc dropdown/segmented pill tùy số ngôn ngữ active).
- Khi khách bấm đổi ngôn ngữ (`setClientLocale(newLocale)`):
  1. Lưu `localStorage.setItem('benmi_client_locale', newLocale)`.
  2. Cập nhật `window.currentLocale = newLocale` và `document.documentElement.lang = newLocale`.
  3. Gọi `applyClientStaticI18n()` để dịch toàn bộ thẻ HTML có `data-i18n`, `data-i18n-placeholder`, `data-i18n-aria-label`.
  4. Gọi `renderDynamicCatalog()`, `renderStoreOperatingHours()`, `applyPickupConfig()`, `checkStoreStatus()`, và `updateTotal()` để vẽ lại tên món, nhóm tùy chọn và giỏ hàng ngay lập tức mà **giữ nguyên toàn bộ món đã chọn trong giỏ**.

---

### 3.3. Thiết Kế Chi Tiết Track 2: Đa Ngôn Ngữ Thực Đơn (Dynamic Menu I18N)

#### A. Schema Cơ Sở Dữ Liệu (Cloudflare D1 Migration `0043_multilingual_menu_i18n.sql`)
Sử dụng cột JSON map `i18n_json TEXT DEFAULT '{}'` để dễ dàng mở rộng thêm bất kỳ ngôn ngữ nào (`zh-TW`, `en`, `vi`, `ja`, `ko`...) mà không cần `ALTER TABLE` thêm cột mới trong tương lai:

```sql
-- Migration: 0043_multilingual_menu_i18n.sql
ALTER TABLE tenant_config ADD COLUMN i18n_json TEXT DEFAULT '{}';
ALTER TABLE tenant_config ADD COLUMN supported_locales TEXT DEFAULT '["zh-TW","en","vi"]';

ALTER TABLE menu_categories ADD COLUMN i18n_json TEXT DEFAULT '{}';
ALTER TABLE menu_items ADD COLUMN i18n_json TEXT DEFAULT '{}';
ALTER TABLE modifier_groups ADD COLUMN i18n_json TEXT DEFAULT '{}';
ALTER TABLE modifier_options ADD COLUMN i18n_json TEXT DEFAULT '{}';
```

**Chuẩn JSON Schema của `i18n_json` theo từng bảng**:
1. **`tenant_config.i18n_json`**:
   ```json
   {
     "en": {
       "brand_name": "Yan Crispy Chicken",
       "brand_subtitle": "Taiwanese Fried Chicken & Snacks",
       "store_address": "No. 71, Beimen St, North District, Hsinchu City",
       "delivery_policy": "Delivery hotline: 0983-238-058 ($800 min in Hsinchu City)",
       "announcement": "Freshly fried to order, please wait 10-15 mins."
     }
   }
   ```
2. **`menu_categories.i18n_json`**:
   ```json
   {
     "en": { "name": "Signature Dishes", "short_name": "Signature" },
     "vi": { "name": "Món Đặc Trưng", "short_name": "Đặc trưng" }
   }
   ```
3. **`menu_items.i18n_json`**:
   ```json
   {
     "en": {
       "name": "Crispy Chicken Cutlet",
       "description": "Served with basil and house pepper salt",
       "badge_text": "Popular"
     },
     "vi": {
       "name": "Gà rán giòn truyền thống",
       "description": "Kèm lá quế và muối tiêu đặc biệt",
       "badge_text": "Bán chạy"
     }
   }
   ```
4. **`modifier_groups.i18n_json`** (đồng bộ với `labels_json`):
   ```json
   {
     "en": { "name": "Flavor Selection", "hint": "Choose 1 flavor" },
     "vi": { "name": "Chọn vị", "hint": "Chọn 1 loại vị" }
   }
   ```
5. **`modifier_options.i18n_json`**:
   ```json
   {
     "en": {
       "name": "Plum Powder",
       "description": "Sweet and tangy plum seasoning",
       "rule_error_message": "Free bowl unlocked for orders over $250",
       "sub_options": {
         "sub_normal": "Normal",
         "sub_extra": "Extra"
       }
     }
   }
   ```

#### B. Hợp Đồng Dữ Liệu Bootstrap API (`/api/tenant/bootstrap`)
- Tăng `BOOTSTRAP_VERSION = 6` trong [`benmi-worker-official/src/modules/bootstrap.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/bootstrap.ts).
- Giải mã `i18n_json` thành thuộc tính `i18n: Record<string, any>` trên:
  - `payload.tenant.i18n` và `payload.tenant.supportedLocales`
  - `payload.catalog[].i18n`
  - `payload.catalog[].items[].i18n`
  - `payload.customizations[].i18n` và `payload.customizations[].options[].i18n`
  - `item.bundleRule.groups[].i18n` và `item.bundleRule.groups[].eligibleItems[].i18n`
- **Kế thừa tự động cho Option liên kết Món (`product_id`)**:
  - Trong `groupOptions(catalog, group)` tại [`option-groups.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/option-groups.ts), nếu một option có `productId` trỏ tới một món trong `menu_items`, `option.i18n` sẽ tự động kế thừa từ `product.i18n` (trừ khi `option.i18n` có khai báo ghi đè riêng). Nhờ đó, chủ quán hoặc seeder chỉ cần dịch tên món 1 lần duy nhất ở `menu_items`!

#### C. Luồng Đặt Đơn, POS, Máy In & Biên Lai LINE Flex
- **Client Checkout (`js/order-detail-checkout.js` & `js/client-checkout.js`)**:
  - Đính kèm `customer_locale: window.currentLocale || 'zh-TW'` vào payload gửi lên `POST /api/orders`.
- **Server Order Snapshot (`src/modules/order-detail.ts` & `src/modules/order-detail-write.ts`)**:
  - Lưu `customerLocale` ở cấp `OrderDetailSnapshot` (`snapshot.customerLocale`).
  - Trong `DetailRound`, các trường `item.name`, `group.groupName`, `choice.name` **vẫn giữ nguyên ngôn ngữ gốc của quán (`product.name`, `group.name`, `option.name`)** để đảm bảo:
    1. **Màn hình POS (`orders.html`)** và **Máy in hóa đơn/tem nhãn (`printer-service.js`)** luôn hiển thị 100% ngôn ngữ gốc của bếp, không bao giờ bị lẫn tiếng nước ngoài làm nhân viên bếp nhầm món.
    2. Báo cáo doanh thu (`reports.ts`) gom nhóm chính xác theo tên gốc và `itemId`.
- **Biên lai LINE Flex (`src/modules/line/templates/order-receipt.ts`)**:
  - Đọc `order.detailSnapshot?.customerLocale || tenantCtx?.locale`.
  - Nếu `customerLocale` khác với ngôn ngữ gốc của quán (ví dụ khách chọn `en` tại quán `zh-TW`), tiêu đề biên lai (`Order Summary`, `Dining Option`, `Pickup Time`, `Total`) hiển thị theo `customerLocale`, và tên món hiển thị song ngữ thanh lịch:
    `Crispy Chicken Cutlet (香酥雞排) ×1` để khách vừa hiểu món mình đặt vừa dễ đối chiếu khi đọc mã nhận đồ tại quầy!

---

### 3.4. Seeding Tự Động Bằng AI Cho Tenant Mới (`gemini_menu_extractor_prompt.md` & `tenant-menu-seeder`)

1. **Cập nhật [`docs/prompts/gemini_menu_extractor_prompt.md`](file:///Users/duccao/Documents/benmi-order/docs/prompts/gemini_menu_extractor_prompt.md)**:
   - Bổ sung quy tắc **Multilingual Culinary Extraction (`i18n`)**:
     - Giữ nguyên ngôn ngữ gốc trên ảnh menu ở các trường chính (`name`, `short_name`, `description`, `badge_text`).
     - Tự động sinh object `i18n` chứa bản dịch chuẩn ẩm thực cho `"en"`, `"zh-TW"`, `"vi"` (các ngôn ngữ khác với ngôn ngữ gốc của menu) trên mọi `tenant`, `categories[]`, `categories[].items[]`, `option_groups[]`, và `option_groups[].options[]`.
     - **Từ điển chuẩn hóa thuật ngữ F&B Đài Loan / Việt Nam sang Tiếng Anh** ngay trong prompt để AI không dịch word-by-word ngô nghê:
       - `甜不辣` -> `"Tempura (Fish Cake)"`, `米血 / 豬血糕` -> `"Pig Blood Cake"`, `百頁豆腐` -> `"Hundred-Layer Tofu"`, `四季豆` -> `"String Beans"`, `花枝丸` -> `"Cuttlefish Balls"`, `鹽酥雞` -> `"Taiwanese Popcorn Chicken"`, `雞排` -> `"Crispy Chicken Cutlet"`, `鍋燒意麵` -> `"Pot-Stewed Egg Noodles"`, `冬粉` -> `"Glass Noodles"`, `梅粉` -> `"Plum Powder"`, `椒鹽` -> `"Pepper Salt"`.
2. **Cập nhật Skill [`tenant-menu-seeder`](file:///Users/duccao/Documents/benmi-order/.agents/skills/tenant-menu-seeder/SKILL.md)**:
   - Cập nhật mẫu SQL Template trong `SKILL.md` để ghi cột `i18n_json` vào `tenant_config`, `menu_categories`, `menu_items`, `modifier_groups`, `modifier_options`.
   - Thêm bước kiểm tra `i18n_json` hợp lệ trong Checklist Preflight trước khi nạp D1.

---

### 3.5. Thiết Lập Thủ Công & Dịch Tự Động Bằng AI Trên POS (`orders.html`)

#### A. Giao diện Nhập Đa Ngôn Ngữ Gọn Nhẹ trên POS (`js/orders-option-groups.js` & `js/orders-menu.js`)
Tuân thủ triết lý **Tablet-First (nút chạm >= 48px, tối giản, không làm rối màn hình chính)**:
- Trong Drawer **Chỉnh sửa Món (`r.page === "product"`)**, **Chỉnh sửa Nhóm tùy chọn (`r.page === "group"`)**, **Chỉnh sửa Lựa chọn (`r.page === "option"`)**, và **Chỉnh sửa Danh mục**:
  - Thêm một khối mở rộng `<details class="ug-i18n-panel" data-section="i18n">` ngay dưới ô nhập Tên chính:
    - Tiêu đề: **`Đa ngôn ngữ / 多語言設定 (EN · 中文 · VI)`** kèm nút **`✨ Dịch tự động bằng AI`** (`data-action="ai-translate-entity"`).
    - Bên trong gồm các ô nhập cho từng ngôn ngữ phụ (VD: nếu quán gốc `zh-TW` thì hiện tab/ô nhập `English (en)` và `Tiếng Việt (vi)`):
      - `Tên hiển thị (Name)`
      - `Mô tả / Nhãn (Description / Badge)` (nếu là món ăn)
  - Trên thanh công cụ của tab **Quản lý Thực đơn (`#view-menu`)**:
    - Thêm nút **`✨ Dịch toàn bộ Menu (AI)`**: Cho phép chủ quán tạo thực đơn mới bằng tiếng Trung hoặc tiếng Việt xong chỉ cần bấm 1 nút để AI dịch toàn bộ danh mục, món ăn và nhóm tùy chọn sang Tiếng Anh (`en`) / Tiếng Trung (`zh-TW`) / Tiếng Việt (`vi`) cho các trường còn trống!

#### B. Backend API Dịch Tự Động (`POST /api/menu/ai-translate` — Cloudflare Workers AI)
- Khai báo native **Workers AI binding**:
  - Trong [`benmi-worker-official/cloudflare.config.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/cloudflare.config.ts) (`dev`, `test`/`staging`, `production`): thêm `AI: bindings.ai()` vào `worker.env`.
  - Trong [`benmi-worker-official/src/types/env.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/types/env.ts): thêm `AI?: Ai;` vào interface `Env`.
- Tạo module [`benmi-worker-official/src/modules/menu-ai-translate.ts`](file:///Users/duccao/Documents/benmi-order/benmi-worker-official/src/modules/menu-ai-translate.ts):
  - **Authentication**: Bảo vệ bằng quyền POS Staff/Admin của tenant (`verifyPosSession` / mật khẩu quán).
  - **Input Payload**:
    ```json
    {
      "sourceLocale": "zh-TW",
      "targetLocales": ["en", "vi"],
      "entities": [
        { "id": "item_1", "kind": "item", "name": "招牌脆皮雞排", "description": "含雞排+飲料", "badge_text": "招牌必點" }
      ]
    }
    ```
  - **Engine**: Gọi trực tiếp **Cloudflare Workers AI** qua `env.AI.run(...)` (không dùng Groq hay OpenRouter, không phụ thuộc API key bên thứ 3). Có thể dùng model đa ngôn ngữ CJK/EN/VI mạnh trên Workers AI (như `@cf/google/gemma-4-26b-a4b-it` hoặc `@cf/qwen/qwen3-30b-a3b-fp8`) kèm system prompt chuẩn hóa thuật ngữ F&B và yêu cầu xuất JSON thuần để trả về bản dịch chính xác cho UI POS điền trực tiếp vào các ô nhập.

---

## 4. Migration & Rollout Strategy

1. **Zero-Downtime & Backward Compatibility**:
   - Toàn bộ cột `i18n_json` mới trong D1 đều có `DEFAULT '{}'`.
   - Các tenant cũ (`benmi`, `yanxiansuji`, `zhadantongxue`...) tiếp tục hoạt động bình thường 100% mà không cần chạy backfill dữ liệu: khi `i18n?.[locale]` trống, hàm `locText()` trên LIFF tự động hiển thị tên gốc (`entity.name`).
   - Đối với `benmi`, từ điển `BENMI_TRANSLATIONS` hiện có sẽ được chuẩn hóa vào cấu trúc `i18n` để đồng nhất toàn hệ thống.
2. **KV Cache Invalidation**:
   - Tăng `BOOTSTRAP_VERSION` từ `5` lên `6` trong `bootstrap.ts` để Worker tự động bỏ qua cache cũ thiếu trường `i18n` và làm mới KV cache một cách an toàn mà không cần xóa thủ công từng tenant.
3. **Rollback Plan**:
   - Vì các cột gốc (`name`, `description`, `badge_text`) hoàn toàn không bị thay đổi, nếu cần rollback frontend chỉ cần revert commit JS/HTML và bump cache-buster `?v=...`.

---

## 5. Alternatives Considered & Trade-offs

| Phương án | Mô tả | Ưu điểm | Nhược điểm | Quyết định |
| :--- | :--- | :--- | :--- | :--- |
| **Option A: Cột JSON `i18n_json` trên từng bảng chính (Đề xuất)** | Thêm `i18n_json TEXT DEFAULT '{}'` vào `menu_categories`, `menu_items`, `modifier_groups`, `modifier_options`. | - Không phát sinh thêm bảng hay `JOIN` khi đọc Bootstrap (< 10ms).<br>- Mở rộng thêm ngôn ngữ mới (`en`, `vi`, `ja`, `ko`, `id`...) không cần sửa schema DB.<br>- Đồng bộ nguyên khối trong 1 câu `INSERT/UPDATE` khi seed và khi lưu từ POS. | Cần `JSON.parse` nhẹ khi tạo Bootstrap (nhưng đã được cache tại KV Edge 1 giờ). | **Chọn (Recommended)** |
| **Option B: Bảng dịch riêng `menu_translations`** | Tạo bảng phụ `(tenant_id, entity_type, entity_id, locale, field, value)`. | Chuẩn hóa 3NF trong SQL. | - Tăng số lượng query/JOIN trong `loadOptionCatalog` và `getTenantBootstrap`.<br>- Làm phức tạp hóa file seed SQL (phải viết hàng trăm dòng `INSERT` rời rạc cho từng trường dịch). | Loại bỏ |
| **Option C: Thêm cột cố định (`name_en`, `name_vi`)** | Thêm từng cột rời cho mỗi ngôn ngữ. | Không cần parse JSON. | Cứng nhắc: mỗi lần thêm ngôn ngữ mới hoặc trường mới phải chạy migration `ALTER TABLE` trên toàn bộ 4–5 bảng. | Loại bỏ |

---

## 6. Cross-Cutting Concerns

- **Performance**:
  - Toàn bộ `i18n` được đóng gói sẵn trong KV `tenant:<id>:bootstrap:v2`. Khi khách đổi ngôn ngữ trên LIFF, việc chuyển đổi diễn ra **100% trên bộ nhớ trình duyệt (0ms network latency, không cần gọi lại API)**.
- **Security**:
  - Endpoint `POST /api/menu/ai-translate` yêu cầu xác thực POS hợp lệ và giới hạn số lượng phần tử mỗi request (tối đa 50 items/lần) để chống lạm dụng quota AI.
  - Mọi chuỗi dịch từ `i18n_json` khi render ra DOM trên LIFF và POS đều đi qua `escapeHtml()` / `esc()` để chống XSS.

---

## 7. Step-by-Step Execution Plan (Lộ Trình Các PR)

### Phase 1 (PR #1): Đa Ngôn Ngữ Giao Diện Tĩnh LIFF (`js/client-i18n.js` + `index.html`)
- [ ] Tạo `js/client-i18n.js` với bộ từ điển `zh-TW`, `en`, `vi`, hàm `ct(key, params)`, `locText()`, và cơ chế tự động phát hiện ngôn ngữ (`?lang=` -> `localStorage` -> `liff.getLanguage()` -> `tenant.locale`).
- [ ] Gắn `data-i18n` cho toàn bộ phần tử tĩnh trong `index.html` (Header quán, trạng thái đóng/mở cửa, giờ mở cửa, chọn hình thức ăn tại bàn/mang về, chọn giờ hẹn lấy, giỏ hàng, thanh toán, popup thông báo).
- [ ] Thêm nút chuyển đổi ngôn ngữ tối giản (`🌐 繁中 / EN / VI`) trên Header `index.html`.
- [ ] Thay thế các chuỗi tĩnh trong `js/client-core.js`, `js/client-menu.js`, `js/client-cart.js`, `js/client-option-groups.js`, `js/client-customizations.js`, `js/client-checkout.js` bằng `ct()`.
- [ ] Cập nhật cache-buster `?v=...` trong `index.html` và viết unit/VM test kiểm tra chuyển đổi ngôn ngữ không làm mất giỏ hàng.

### Phase 2 (PR #2): Schema D1 `i18n_json` & Backend Bootstrap / Order Receipt
- [ ] Tạo migration `benmi-worker-official/migrations/0043_multilingual_menu_i18n.sql` bổ sung `i18n_json` cho `tenant_config`, `menu_categories`, `menu_items`, `modifier_groups`, `modifier_options`.
- [ ] Cập nhật `loadOptionCatalog()`, `groupOptions()`, `projectOptionRule()`, `saveOptionEntity()` trong `src/modules/option-groups.ts` và `saveMenu()` trong `src/modules/menu.ts` để đọc/ghi và bảo toàn `i18n` (bao gồm kế thừa `i18n` cho option liên kết `productId`).
- [ ] Cập nhật `getTenantBootstrap()` trong `src/modules/bootstrap.ts` (tăng `BOOTSTRAP_VERSION = 6`) trả về `i18n` cho toàn bộ thực thể menu, và render qua `locText()` trên LIFF.
- [ ] Truyền `customer_locale` khi đặt đơn và cập nhật `order-receipt.ts` để hiển thị biên lai LINE Flex song ngữ / theo ngôn ngữ khách chọn (trong khi POS & máy in giữ nguyên ngôn ngữ gốc).

### Phase 3 (PR #3): AI Seeding Tự Động Cho Tenant Mới
- [ ] Cập nhật [`docs/prompts/gemini_menu_extractor_prompt.md`](file:///Users/duccao/Documents/benmi-order/docs/prompts/gemini_menu_extractor_prompt.md) để trích xuất đồng thời `i18n: { "en": {...}, "zh-TW": {...}, "vi": {...} }` với bộ quy tắc dịch thuật ngữ ẩm thực F&B chuẩn xác.
- [ ] Cập nhật skill [`tenant-menu-seeder/SKILL.md`](file:///Users/duccao/Documents/benmi-order/.agents/skills/tenant-menu-seeder/SKILL.md) để sinh câu lệnh SQL seed có đầy đủ `i18n_json`.

### Phase 4 (PR #4): Thiết Lập Đa Ngôn Ngữ Thủ Công + Nút "Dịch Tự Động Bằng AI" Trên POS
- [ ] Khai báo `AI: bindings.ai()` trong `benmi-worker-official/cloudflare.config.ts` và `AI?: Ai` trong `benmi-worker-official/src/types/env.ts`.
- [ ] Xây dựng endpoint `POST /api/menu/ai-translate` (`src/modules/menu-ai-translate.ts`) gọi trực tiếp Cloudflare Workers AI (`env.AI.run(...)`, không dùng Groq/OpenRouter).
- [ ] Bổ sung mục collapsible **`Đa ngôn ngữ (EN / 中文 / VI)`** kèm nút **`✨ Dịch tự động bằng AI`** trong Drawer Món, Nhóm tùy chọn, Lựa chọn (`js/orders-option-groups.js`) và Danh mục (`js/orders-menu.js` + `js/orders-menu-model.js`).
- [ ] Bổ sung nút **`✨ Dịch toàn bộ Menu bằng AI`** trên thanh công cụ Quản lý Thực đơn POS.
- [ ] Cập nhật từ điển POS (`js/orders-i18n.js`), bump cache-buster `?v=...` trong `orders.html`, và đồng bộ `graphify update .`.

---

## 8. Verification & Test Plan

- **Automated Tests**:
  - `npm run check` (`node scripts/check-frontend.js`): Đảm bảo không xung đột biến toàn cục giữa `js/client-i18n.js` và các script hiện tại.
  - Test VM cho LIFF (`tests/test_client_i18n.cjs`): Kiểm tra đổi ngôn ngữ `zh-TW` <-> `en` <-> `vi` cập nhật đúng text tĩnh, tên danh mục, tên món, tên nhóm tùy chọn, và giữ nguyên giỏ hàng + tổng tiền.
  - Test Backend (`benmi-worker-official/tests/multilingual-menu.test.cjs`): Kiểm tra lưu `i18n` qua `/api/menu/options`, kế thừa `i18n` qua `productId`, fallback cho tenant cũ không có `i18n_json`, và bảo toàn ngôn ngữ gốc trong `order_detail_snapshots`.
- **Manual Verification**:
  - Mở LIFF với `?lang=en` và `?lang=zh-TW`, chuyển đổi qua lại trên Header, thêm món có tùy chọn bắt buộc vào giỏ và đặt thử đơn trên môi trường Dev.
  - Mở POS (`orders.html`), tạo món mới, bấm **"✨ Dịch tự động bằng AI"**, kiểm tra kết quả điền tự động vào ô Tiếng Anh / Tiếng Việt và lưu xuống D1.
