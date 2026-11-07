# Benmi & Multi-Tenant Order Platform Architecture & Deployment Guide

Tài liệu này mô tả chi tiết kiến trúc đa môi trường (**STAGING** và **PRODUCTION**), cấu trúc multi-tenant, cơ chế tự động nhận diện biến môi trường (Zero Manual Hardcode Config), và quy trình deploy cho hệ thống đặt món qua LINE LIFF & POS Dashboard.

---

## 1. Kiến Trúc Tổng Quan (System Architecture)

Hệ thống bao gồm 3 tầng chính:
- **FrontEnd (Cloudflare Pages):** Gồm trang thực đơn khách hàng (`index.html`) và Bảng quản lý đơn hàng POS (`orders.html`), phân tách logic thành các module JS tinh gọn. Được tích hợp module **WebAssembly (`wasm/pricing-engine/`)** biên dịch trực tiếp từ Rust để tính toán giỏ hàng, combo bundle và kiểm định tùy chọn món theo thời gian thực với tốc độ sub-millisecond.
- **BackEnd Gateway (Cloudflare Workers, D1 & KV):** Xử lý API, xác thực LINE Webhook, đồng bộ đơn hàng thời gian thực (`benmi-worker-official`).
- **Lõi Tính Giá & Kiểm Định Đơn Hàng (Rust Engine - `benmi-pricing-rs`):** Microservice viết bằng Rust (`workers-rs`) kết nối qua Service Binding RPC (`env.PRICING_ENGINE`), đảm bảo đối chiếu đơn hàng và xác thực quy tắc tùy biến với số học thập phân chính xác tuyệt đối (`rust_decimal`).

```mermaid
graph TD
    subgraph github ["GitHub Repo: benmi-order"]
        BranchStaging["Branch: staging"]
        BranchMain["Branch: main"]
    end

    subgraph pages ["Cloudflare Pages (benmi-order.pages.dev)"]
        SubDev["Môi trường DEV:<br>dev.benmi-order.pages.dev"]
        SubStaging["Môi trường STAGING:<br>staging.benmi-order.pages.dev"]
        SubProd["Môi trường PRODUCTION:<br>benmi-order.pages.dev"]
    end

    BranchDev -- "auto deploy" --> SubDev
    BranchStaging -- "auto deploy" --> SubStaging
    BranchMain -- "auto deploy" --> SubProd

    subgraph dev_env ["Môi trường DEV (R&D / Testing)"]
        A0[LINE Account Dev] <--> SubDev
        SubDev <--> C0["Worker DEV:<br>platform-worker-dev.thuanmnc.workers.dev"]
        C0 <--> D0_DB[("D1 DB: blab-db-dev")]
        C0 <--> KV0[("KV: ORDER_STATE (dev)")]
    end

    subgraph test_env ["Môi trường STAGING (Demo & QA)"]
        A1[LINE Account Test] <--> SubStaging
        SubStaging <--> C1["Worker STAGING:<br>platform-worker-staging.thuanmnc.workers.dev"]
        C1 <--> D1_DB[("D1 DB: blab-db-test")]
        C1 <--> KV1[("KV: ORDER_STATE (staging)")]
    end

    subgraph prod_env ["Môi trường PRODUCTION (Live)"]
        A2[LINE Account Production] <--> SubProd
        SubProd <--> C2["Worker PRODUCTION:<br>benmi-worker-official.thuanmnc.workers.dev"]
        C2 <--> D2_DB[("D1 DB: blab-db-production")]
        C2 <--> KV2[("KV: ORDER_STATE (prod)")]
    end

    style github fill:#f5f5f5,stroke:#333,stroke-width:2px
    style pages fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style dev_env fill:#f3e8ff,stroke:#6b21a8,stroke-width:2px
    style test_env fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    style prod_env fill:#efebe9,stroke:#4e342e,stroke-width:2px
```

---

## 2. Bảng Tra Cứu Môi Trường & Tự Động Nhận Diện

Hệ thống sử dụng cơ chế **Tự động nhận diện môi trường (Dynamic Environment Resolution)**, lập trình viên và quản trị viên **không cần chỉnh sửa hardcode bất kỳ biến nào trong code** khi chuyển đổi giữa Dev, Staging và Production.

| Thông số | Môi trường DEV | Môi trường STAGING | Môi trường PRODUCTION |
| :--- | :--- | :--- | :--- |
| **Mục đích** | Phát triển, thử nghiệm tính năng mới | Kiểm thử hoàn thiện & Demo quán mới | Vận hành kinh doanh thực tế |
| **Domain FrontEnd** | [dev.benmi-order.pages.dev](https://dev.benmi-order.pages.dev) | [staging.benmi-order.pages.dev](https://staging.benmi-order.pages.dev) | [benmi-order.pages.dev](https://benmi-order.pages.dev) |
| **Worker API URL (`WORKER_BASE`)** | `https://platform-worker-dev.thuanmnc.workers.dev` | `https://platform-worker-staging.thuanmnc.workers.dev` | `https://benmi-worker-official.thuanmnc.workers.dev` |
| **Default Fallback LIFF ID** | `2011224566-kLLdMjkq` | `2009555608-DMioljsI` | `2009560906-c5taZfiY` |
| **Cơ sở dữ liệu D1** | `blab-db-dev` | `blab-db-test` | `blab-db-production` |
| **Branch GitHub tương ứng** | `dev` | `staging` | `main` |

### Cơ chế Tự Động:
1. **`WORKER_BASE`**: Tự động trỏ sang `platform-worker-dev` khi chạy trên `localhost`, `127.0.0.1`, hoặc domain có chứa `dev`. Trỏ sang `platform-worker-staging` khi domain chứa `staging`/`test`. Ngược lại tự động trỏ về `benmi-worker-official` trên Production.
2. **`liffId`**: Được nạp động trực tiếp từ cấu hình của từng tenant (`tenant_config` / `/api/tenant/bootstrap`). Nếu chưa có, tự động dùng fallback LIFF ID tương ứng với môi trường.
3. **Tenant Routing**: Hỗ trợ qua tham số URL `?tenant_id=<id>` (ví dụ `?tenant_id=benmi`, `?tenant_id=zhadantongxue`, `?tenant_id=weiweibao`).

---

## 3. Quy Trình Triển Khai Chuẩn (Standard Deployment Workflow)

```mermaid
flowchart TD
    Start([Bắt đầu phát triển]) --> CodeDev[1. Lập trình & Kiểm thử trên nhánh dev]
    CodeDev --> DeployDev["Deploy Worker Dev:<br>cd benmi-worker-official && npm run deploy:dev"]
    DeployDev --> PushDev["Push lên GitHub branch dev:<br>Cloudflare Pages tự deploy dev.benmi-order.pages.dev"]
    PushDev --> VerifyDev{Kiểm thử Dev OK?}
    
    VerifyDev -- Có lỗi --> FixDev[Sửa lỗi]
    FixDev --> CodeDev
    
    VerifyDev -- OK, chuyển sang QA/Demo --> MergeStaging["2. Merge dev vào staging & Push:<br>git checkout staging && git merge dev && git push origin staging"]
    MergeStaging --> DeployWorkerStaging["Deploy Worker Staging:<br>cd benmi-worker-official && npm run deploy:staging"]
    DeployWorkerStaging --> VerifyStaging{Demo / QA Staging OK?}
    
    VerifyStaging -- OK, sẵn sàng Release --> ApplyD1Prod["3. Apply D1 Migrations Production:<br>npm run db:migrations:apply:production"]
    ApplyD1Prod --> DeployWorkerProd["4. Deploy Worker Production:<br>cd benmi-worker-official && npm run deploy"]
    DeployWorkerProd --> MergeMain["5. Merge staging vào main & Push:<br>git checkout main && git merge staging && git push origin main"]
    MergeMain --> PagesProd["Cloudflare Pages tự động deploy Production benmi-order.pages.dev"]
    PagesProd --> End([Hoàn thành Deploy Production])
```

---

## 4. Hướng Dẫn Lệnh Deploy Chi Tiết

Backend sử dụng Cloudflare `cf` CLI với `cloudflare.config.ts`. Cài Node.js **24 LTS**, sau đó chạy trong `benmi-worker-official/`:

```bash
npm ci
npx cf auth login
npm run check
npm run build:dev
npm run dev
```

`cf` có credentials riêng với Wrangler. Trong CI, đặt `CLOUDFLARE_API_TOKEN` và `CLOUDFLARE_ACCOUNT_ID`. Các npm script đã chọn đúng mode: `dev`, `test` cho staging, và `production`. `--mode staging` cũng được hỗ trợ; mode không hợp lệ sẽ báo lỗi.

| Công việc | Dev | Staging | Production |
| :--- | :--- | :--- | :--- |
| Build | `npm run build:dev` | `npm run build:staging` | `npm run build:production` |
| Deploy | `npm run deploy:dev` | `npm run deploy:staging` | `npm run deploy` |
| Migration chưa apply | `npm run db:migrations:list:dev` | `npm run db:migrations:list:staging` | `npm run db:migrations:list:production` |
| Apply migration D1 | `npm run db:migrations:apply:dev` | `npm run db:migrations:apply:staging` | `npm run db:migrations:apply:production` |

D1 CLI dùng database ID và mặc định truy cập remote. `scripts/cloudflare-d1.cjs` đọc ID/account từ cấu hình `cf`, nhận SQL hoặc file qua JSON request, và được dùng bởi các script seed/copy dữ liệu. Giữ nguyên thư mục migrations và bảng `d1_migrations`.

`wrangler` vẫn là dependency của bundler do `cf` gọi nội bộ. File `wrangler.jsonc` được giữ để đối chiếu cấu hình trước migration và dùng `wrangler tail` khi cần log trực tiếp; nó không điều khiển `cf dev/build/deploy`. Không chỉnh song song hai cấu hình. Build output và types được sinh trong `.cloudflare/` và không commit vào Git.

Tài liệu: [cf cho người dùng Wrangler](https://developers.cloudflare.com/cf/wrangler/), [migration](https://developers.cloudflare.com/cf/wrangler/migrate/).

### A. Deploy lên STAGING:
```bash
# 1. Apply migration D1 Test / Staging (nếu có migration mới):
cd benmi-worker-official
npm run db:migrations:apply:staging

# 2. Deploy Worker Staging:
npm run deploy:staging

# 3. Deploy FrontEnd Staging:
git add .
git commit -m "feat/fix: mô tả thay đổi"
git push origin staging
```

### B. Deploy lên PRODUCTION:
```bash
# 1. Apply migration D1 Production:
cd benmi-worker-official
npm run db:migrations:apply:production

# 2. Deploy Worker Production:
npm run deploy

# 3. Merge & Deploy FrontEnd Production:
git checkout main
git merge staging
git push origin main
git checkout staging
```

### C. Động Cơ Rust (`benmi-pricing-rs`) & WebAssembly (`wasm/`):
- **Phía Client (WebAssembly)**:
  - Bản build WASM được commit sẵn trong `wasm/pricing-engine/`. Khi push lên Git, Cloudflare Pages tự động phân phối như một asset tĩnh với bộ nhớ đệm bất biến 1 năm (`/wasm/*`).
  - Lệnh build lại WASM khi có thay đổi logic: `npm run build:wasm`.
  - Lệnh kiểm thử tính toán WASM: `npm run test:wasm`.
- **Phía Backend (`benmi-pricing-rs`)**:
  - Worker Rust là stateless microservice, **không cần deploy lại** khi thêm quán mới hay đổi giá món/menu hàng ngày.
  - Chỉ deploy lại khi thay đổi thuật toán khuyến mãi hoặc schema dữ liệu:
    ```bash
    cd benmi-pricing-rs/crates/pricing-worker
    worker-build --release
    npx --prefix ../../../benmi-worker-official wrangler deploy
    ```
