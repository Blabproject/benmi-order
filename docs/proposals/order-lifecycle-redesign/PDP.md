# PDP: Order lifecycle và thanh toán — Replace/Migrate

Ngày: 2026-11-14, Asia/Tokyo. Trạng thái: đang bắt đầu implementation; xem STATUS.md để biết phần thực sự đã hoàn thành. Tài liệu này thay thế quyết định dùng order PAID làm điểm thu tiền trong bản 0088/0089 và candidate release trước đây. Requirement analytics ban đầu vẫn giữ nguyên.

## 1. Kết luận và mục tiêu

Loại `PAID` khỏi **trạng thái đơn chuẩn mới**. Giữ `payments.status = PAID` vì đây là trạng thái giao dịch LINE Pay hợp lệ. Dùng `COMPLETED` cho đơn đã kết thúc phục vụ, cả mang đi và ăn tại bàn. UI mang đi tiếp tục có nút “Đã giao món”; tên enum nội bộ không bắt người dùng thêm thao tác.

Không có bằng chứng LINE Pay đã tái sử dụng order PAID: Git cho thấy order PAID được thêm ngày 2026-08-23 (`c1ff06a0`) cho dine-in; LINE Pay thêm ngày 2026-11-01 (`565826ae`). Hiện LINE Pay ghi payment PAID và chuyển order PENDING_PAYMENT → NEW. Trigger 0075 thậm chí chặn order PAID trên đơn có payment.

Sai ở thiết kế foundation vừa làm là lấy nhánh dine-in cũ làm đại diện xác nhận tiền, rồi coi coverage đó đủ để release. Snapshot Production khảo sát ở lượt trước có 5.515 PICKED_UP và 98 PAID; số 98 chỉ là nhóm trạng thái cũ, không phải tổng đơn đã thu tiền. Không thực hiện lại truy vấn Production trong audit này.

Mục tiêu nghiệm thu:

- Một bộ quy tắc chuyển trạng thái cho POS legacy, staff, LINE và payment publication; không có fallback gán trạng thái tùy ý.
- Mỗi lần hoàn tất chỉ ghi một completion; mỗi khoản thu/hoàn phải có bằng chứng và khóa chống lặp độc lập.
- Không thay đổi món/tổng của đơn đã hoàn tất qua writer cũ; không mở lại bởi callback đến muộn.
- Giữ luồng thao tác chính của browser và APK; không bắt kết thúc đơn bằng PAID.
- Báo cáo phân biệt doanh số đơn hoàn tất, tiền thu và tiền hoàn, có coverage cho lịch sử.

Ngoài phạm vi phiên bản đầu: thanh toán chia nhiều phương thức, công nợ, partial refund mới, chỉnh giá sau hoàn tất, mở lại đơn hoàn tất. Không viết lại giao thức LINE Pay đang có hoặc pricing engine.

## 2. Audit hiện trạng và bằng chứng

### 2.1 Các đường nghiệp vụ đã rà

| Nhóm | Tác nhân / đường vào | Ghi dữ liệu và hành vi hiện tại | Điểm cần thay |
| --- | --- | --- | --- |
| 1. Đặt/sửa/gọi thêm từ khách | LIFF/web → create/append/modify | `order-detail-write.ts:28,69,117`; legacy `orders.ts:802,863,910,1960`; snapshot, items, đôi khi đặt lại NEW | Chung revision và policy; phân biệt đơn mới với round mới; giữ timestamp từng round |
| 2. Thao tác POS legacy | HTTP `/api/update` | `orders.ts:1025,1049,1283,1296,1309`; takeaway PICKED_UP, dine-in PAID; fallback status bất kỳ | Command API, allowlist, CAS, session, không UPSERT toàn đơn để đổi status |
| 3. Thao tác staff | HTTP `/api/staff/orders/:id/status` và rounds | `staff.ts:386–473`; có transition map/revision nhưng map riêng; final list dùng PAID/PICKED_UP | Dùng cùng policy; giữ quyền staff và chống xung đột bàn |
| 4. Callback và hội thoại LINE | Webhook postback/text → direct SQL/saveOrder | `line.ts:569,577,627,670,1214–1360`; trả NEW/REJECTED; một số nhánh trả tin trước khi lưu | Kiểm tra action ID, owner, revision và trạng thái hiện tại; commit trước thông báo |
| 5. Thanh toán trước | LINE Pay request/confirm/reconcile cron | `payments.ts:75–89,189–245`; PENDING_PAYMENT → NEW khi payment PAID | Giữ lease/publication fence, nối publication vào command boundary; không phát completion |
| 6. Hủy giao dịch và hoàn tiền | Khách cancel; nhân viên refund; reconciliation | `payments.ts:127–151,237,327`; refund thay payment, không kết thúc order | Chính sách cancel/refund rõ; thu hồi đơn chưa giao khi hoàn toàn bộ thành công |
| 7. Reader và tác động phụ | POS live/history/modal, bàn, in, LINE receipt, Sheets, reports | `orders-core.js:1260`; live:648; modals:438; history:166; tables:27; `orders.ts:1697`; report repository:22 | Chung adapter/read contract; không bỏ sót release bàn, lịch sử, paid badge, xuất dữ liệu |

Các HTTP thay đổi trạng thái dẫn tới D1; thông báo LINE/Sheets là side effect sau commit, không phải nguồn trạng thái. Nút in/badge thanh toán không được tự thay đổi trạng thái đơn. Audit là source tracing và probes cục bộ; không phải nghiệm thu LINE thực hoặc thiết bị thật.

### 2.2 Vấn đề phải sửa trước release lifecycle

| Mức | Phát hiện | Bằng chứng / giới hạn |
| --- | --- | --- |
| P1 | Status legacy không có allowlist đầy đủ, có thể bỏ qua các bước | `orders.ts:1309`; probe gửi NOT_A_REAL_STATE trả 200 và lưu nguyên chuỗi |
| P1 | PICKED_UP không có bảo vệ tương đương PAID của foundation | Probe PICKED_UP → WAITING_CUSTOMER_CHANGE trả 200; saveOrder NEW giữ status PICKED_UP nhưng đổi tổng 120 → 999 |
| P1 | Callback cũ có thể mở lại đơn | SQL `reject_disagree` tại `line.ts:577` chỉ điều kiện tenant/key; probe SQL đổi PICKED_UP → NEW. Chưa chạy E2E webhook trong lượt này |
| P1 | Suy thu tiền từ order PAID không đủ bằng chứng | Trên schema 0089, PICKED_UP → PAID tạo một collected event; request chỉ có key/status |
| P1 | Quyền ghi legacy và quyền xem báo cáo chưa là server session gate | `index.ts:94,100`, `orders.ts:1035`, `reports.ts:7`; route/handler không kiểm tra phiên POS. Chưa kiểm chứng lớp bảo vệ ngoài Worker; không dựa vào UI login để làm ranh giới quyền |
| P1 | Thống kê dùng các tập đơn khác nhau | Item analytics tính DONE; history-summary cộng REJECTED; mẫu số dùng created_at đơn, dòng món dùng created_at items |
| P1 | Hủy phục vụ và hoàn tiền chưa có quy tắc phối hợp | Refund giữ nguyên NEW/ACCEPTED/DONE; có thể vẫn nằm hàng đang làm sau hoàn. Cần test và policy trước release |
| P1 | Bảo vệ thanh toán phải bao phủ callback và retries | `payments.ts:142–145` cho nhánh refund PROCESSING/UNKNOWN vào lời gọi refund khi query không xác nhận. Comment nói chỉ QUERY sau crash; cần kiểm chứng/chỉnh behavior để không POST lại khi kết quả còn bất định |
| P2, bắt buộc trước analytics | Join report thiếu tenant ở phía order; hai dòng cross-tenant đã ghi nhận trước | Repository join chỉ key và lọc oi.tenant_id; không sửa dữ liệu thật trong lượt này. Sửa join và xử lý dữ liệu theo patch có snapshot |

Probes của đợt audit cũ được lưu trong stash trước reset, không được phục hồi vào code mới. Kết quả lịch sử ở [REDESIGN_PROBE_RESULTS.json](REDESIGN_PROBE_RESULTS.json). Hai DB in-memory dùng schema đến 0087 và 0089, cùng handler local hiện tại; không phải request tới Production. Đây là quan sát lỗi, **không phải test acceptance đạt**. Ví dụ history: đơn giao 120 + đơn từ chối 80 trả count=2, total=200.

## 3. Mô hình đề xuất

### 3.1 Trạng thái đơn và thanh toán

```text
Đơn thủ công:     NEW → ACCEPTED → READY → COMPLETED
                                      ↗
                         ACCEPTED ────┘  (hoàn tất nhanh như UI hiện có)

Đơn LINE Pay:    PENDING_PAYMENT ── xác nhận đã thu ──→ NEW → cùng luồng trên

Đơn chưa hoàn tất ── hủy có lý do ──→ CANCELLED
Đơn hết hiệu lực  ── chính sách rõ ─→ EXPIRED

COMPLETED giữ nguyên khi hoàn tiền sau giao.
CANCELLED không đồng nghĩa tiền đã hoàn.
```

PENDING_PAYMENT là **cổng đưa đơn vào hàng phục vụ**, không phải bản sao mọi trạng thái giao dịch. Giữ tên này trong đợt đầu để bảo toàn cơ chế chưa thu thì chưa phát đơn; không thêm trạng thái order PAID/REFUNDED. Chỉ provider publication có quyền đưa qua cổng. Giao dịch UNKNOWN tiếp tục bị giữ để đối soát, không cho chuyển sang thu thủ công.

READY là nghĩa thực tế của DONE cũ. COMPLETED có nghĩa hoàn tất phục vụ, độc lập với phương thức tiền. Giữ `dining_option` để UI dùng “Đã giao món” hoặc “Kết thúc bàn”. Bàn được giải phóng theo COMPLETED/CANCELLED/EXPIRED; không dựa vào payment PAID. Chưa xác nhận tenant muốn chặn kết thúc khi chưa thu nên chưa bật điều kiện đó mặc định.

Đề nghị đổi món/hủy là `pendingAction`, tham chiếu order revision và actor, thay vì chiếm trạng thái phục vụ. Khi có pendingAction chưa xử lý, chặn thao tác hoàn tất/ready xung đột. Trả lời hợp lệ giải quyết action và chuyển đúng bước đã định; callback cũ hết hiệu lực không mở lại đơn.

Thanh toán:

- Giữ nguyên payment machine LINE Pay: REQUESTING/PENDING/CONFIRMING/UNKNOWN/PAID/CANCELLED/FAILED/REFUND_PENDING/REFUNDED/REFUND_FAILED; không đổi toàn bộ provider schema trong cùng dự án.
- Manual: xác nhận khoản thu bởi nhân viên có phiên, phương thức và số tiền; hoàn bằng thao tác riêng có lý do/quyền. Không lấy order status làm receipt.
- Order API chuẩn có `settlement` gồm `method`, `collectedAmount`, `refundedAmount`, `netCollectedAmount`, `evidence`, `operationStatus`. Tiền dựa vào nghiệp vụ đã thành công; REFUND_PENDING/FAILED chưa trừ tiền thu.
- Lịch sử thiếu bằng chứng: amount/time là null, evidence=unknown hoặc legacy_status_only. Không đổi unknown thành unpaid/0.
- Đơn mới chưa xác nhận thu có known zero collection trong hệ thống, kèm `unconfirmed`; điều đó không chứng minh khách chưa trả ngoài hệ thống.
- Đơn tổng 0 ghi completion giá trị 0, không cần receipt giả hoặc provider charge bằng 0.

Ví dụ hợp lệ:

| Đơn | Tiền | Diễn giải |
| --- | --- | --- |
| NEW | LINE Pay PAID | Khách đã trả, quán chưa nhận |
| COMPLETED | manual confirmed | Đã giao/kết thúc và có xác nhận thu |
| COMPLETED | unknown legacy | Đơn cũ hoàn tất, không biết chi tiết khoản thu |
| CANCELLED | PAID / refund pending | Đã hủy phục vụ, đang chờ hoàn |
| COMPLETED | REFUNDED | Đã phục vụ, hoàn tiền sau đó; không xóa lịch sử phục vụ |

### 3.2 Command và ranh giới giao dịch

```text
POS browser / APK ── session + command ─┐
LINE ── signature + owner/action ID ───┼─→ order command service ─→ D1
Payment ── lease + provider evidence ──┘      │ state + event + revision
                                            └→ outbox → LINE / Sheets
Analytics ← completion snapshot + receipts/refunds + change events
```

API mới đề xuất `POST /api/orders/:key/commands`:

```json
{
  "operationId": "client-persisted-uuid",
  "expectedRevision": 12,
  "action": "complete",
  "settlement": { "mode": "unchanged" }
}
```

Các action có kiểu riêng: accept, mark_ready, complete, request_change, resolve_change, request_cancel, resolve_cancel, cancel. Manual collect/refund dùng action riêng hoặc complete kèm `settlement.mode=confirm_manual`, amount/currency/method. Amount request phải khớp tổng/revision chuẩn; không tin amount từ UI. Payload action không cho gán trực tiếp bất kỳ enum nào.

Quy tắc commit:

1. Tenant lấy từ phiên/quyền đã xác thực; resolve key trong tenant, kiểm tra nguồn/actor/capability. Customer edit phải có quyền sở hữu; không có quyền complete/refund. Webhook kiểm tra đúng người và pendingAction cụ thể.
2. Idempotency theo tenant + operationId, lưu hash toàn bộ ý định và response. Replay cùng hash trả kết quả đã commit; khác hash trả conflict. Retry sau mất response giữ operationId, không tạo mới.
3. Một `revision` order dùng cho status, detail, pending action và kết toán ảnh hưởng điều kiện thao tác. `detail_revision` vẫn trỏ snapshot. Các writer hiện tại phải cùng tăng/check revision; không để snapshot revision là hàng rào duy nhất.
4. Compare-and-set kiểm tra revision, state, pending action và tiền đã biết ngay tại commit. Ghi state, completion/receipt nếu có, request result, xóa pending action và outbox trong một transaction. Nếu CAS không đổi hàng nào phải abort cả transaction, không lưu event/receipt mồ côi; test cụ thể trên D1/Miniflare.
5. Không cập nhật toàn bộ order qua UPSERT khi chỉ đổi trạng thái. Chỉ ghi trường thuộc command. Invariant DB chặn terminal → active, sửa món/giá terminal và ghi tiền thiếu command context, kể cả đường SQL cũ. Đơn đã có khoản thu xác nhận cũng khóa món/giá dù chưa COMPLETED; hoàn tiền không tự mở khóa để sửa lại giá đã thu.
6. API trả state/revision/payment mới; UI bỏ optimistic override khi conflict và refresh. Event version/ETag thay đổi cả khi chỉ có tiền thay đổi.

Những điều kiện bắt buộc: NEW không được complete trực tiếp; ACCEPTED/READY có thể complete khi không có pending action. COMPLETED/CANCELLED/EXPIRED không mở lại bằng accept, callback hoặc append. Sửa sau hoàn tất dùng đơn mới/điều chỉnh riêng ở phiên bản sau.

### 3.3 Thu tiền thủ công và UI

Câu hỏi cũ về ý nghĩa nút PICKED_UP vẫn chưa được trả lời. Thiết kế không cần đoán: completion và receipt tách nhau, UI có thể gộp chúng vào **một command atomic** khi thao tác thực tế bao gồm cả thu tiền.

- Nếu chỉ giao món: action complete, settlement unchanged; không tự ghi thu.
- Nếu nhân viên xác nhận đã nhận đủ tiền khi giao: complete + confirm_manual; nút/nhãn phải diễn đạt cả hai ý và ghi actor. Không thêm bước chuyển sang order PAID.
- Nếu LINE Pay đã thu: chỉ complete, hiển thị đã trả; không đưa confirm_manual vào payload.
- Nếu tiền đang UNKNOWN/CONFIRMING/refund pending: không cho thu thủ công để giải quyết nhanh; yêu cầu đối soát giao dịch trước.
- Old client gửi PAID/PICKED_UP chỉ được adapter coi là completion, không đủ bằng chứng tạo receipt mới. UI mới cho biết phần tiền chưa xác nhận nếu cần; không che giấu thiếu dữ liệu bằng số 0.

Policy có thể cấu hình theo tenant (`manual_completion_mode`, `require_confirmed_collection_to_complete`), không hardcode tenant/dining. Giá trị ban đầu phải dựa trên quy trình được xác nhận. Mặc định an toàn về dữ liệu là không suy thu từ status. Không tự bật một thao tác thu tiền mới trong rollout.

### 3.4 Hủy và hoàn tiền

- Cancel trước giao kết thúc phục vụ; nếu đã thu thì tạo attention “cần hoàn”, không nói đã hoàn khi chỉ đổi status.
- Refund LINE Pay giữ flow quyền/lease hiện có. Chỉ refund thành công mới có refundedAmount. Khi toàn bộ tiền hoàn thành công và đơn chưa COMPLETED, cập nhật CANCELLED cùng ghi nhận kết quả provider trong DB; nếu đã COMPLETED, giữ COMPLETED.
- Cuộc đua complete/refund: refund pending chặn completion; nếu completion đã commit trước khi bắt đầu refund thì refund là sau giao. Hai nhánh kiểm tra DB tại commit, không dựa bản đọc cũ.
- Hoàn thủ công chỉ ghi sau nhân viên xác nhận đã trả, có operationId, actor, lý do và tham chiếu receipt. Trong bản đầu chỉ hoàn toàn bộ, không vượt số đã thu, không hoàn hai lần.
- Sau lỗi network của provider, UNKNOWN nghĩa chưa biết kết quả; không chuyển FAILED để mở đường thu/hoàn lần hai. Khắc phục đường retry refund đang nghi ngờ bằng test crash/lost response; không dựa vào provider tự loại trùng khi chưa chứng minh.
- Không tự hoàn tiền hồi tố hoặc tự gửi lệnh refund trong backfill.

## 4. Dữ liệu và analytics

Thay vì biến toàn hệ thống thành event sourcing, giữ `orders` là snapshot hiện tại và bổ sung dữ liệu nghiệp vụ cần thiết:

| Thành phần đề xuất | Nội dung / ràng buộc |
| --- | --- |
| orders.order_state | Enum chuẩn; CHECK/guard transition; `status` tạm thời là projection cho client cũ, không có hai nguồn chân lý |
| orders.revision | CAS dùng chung mọi writer; không reset khi migrate |
| order_commands | tenant, operationId, actor, action, payloadHash, response; unique tenant+operationId; replay không phát lại side effect |
| order_completions | Một hàng/order, tenant, amount/currency, detailRevision hoặc snapshot reference, completedAt nullable, evidence, policyVersion, source command. Không xóa khi refund |
| manual_payment_entries | Collect/refund bất biến, receipt reference, amount đơn vị nhỏ nhất, currency, actor, occurredAt, operationId. Giới hạn tổng hoàn trong transaction |
| pending_actions | Thêm action ID/version/order revision/resume state, expiry/actor. Resolve một lần, không suy người sở hữu từ key |
| order_lifecycle_events | Giữ audit cũ; bổ sung version/quality hoặc bảng điều chỉnh để loại sự kiện suy luận cũ khỏi số thu chuẩn. Không sửa event lịch sử tại chỗ |

FK/unique kiểm tra cả tenant+order; item join cũng dùng cả hai. Index theo tenant+completedAt, tenant+orderKey, tenant+operationId; index pending jobs theo trạng thái/thời gian. Tiền dùng integer minor units và currency exponent rõ; legacy REAL chỉ chuyển khi biểu diễn chính xác, hàng không hợp lệ đưa review, không làm tròn âm thầm. LINE Pay TWD hiện integer vẫn giữ contract đó.

Completion amount là tổng đơn sau giảm giá/phụ thu tại lúc hoàn tất. Item ranking đọc đúng revision; không tính lại giá lịch sử theo menu mới. Dùng server timestamps, tenant timezone/cutoff có policy version. Không dùng updated_at làm completedAt.

Báo cáo mới:

- **Doanh số hoàn tất**: sum completion amount; số đơn = distinct completion; AOV = doanh số/số đơn, cùng tập/kỳ. READY không tính. REJECTED/CANCELLED không tính. Refund sau giao không xóa completion.
- **Tiền thực thu ghi nhận** và **tiền hoàn thành công**: theo timestamp receipt/refund; net collected = collected − refunded trong kỳ, không gọi đó là AOV. Tiền LINE Pay trước giao không tự tạo doanh số hoàn tất.
- **Doanh số sau điều chỉnh/hoàn** nếu cần: metric riêng, công thức/kỳ cohort rõ; không trừ hoàn của đơn kỳ trước vào AOV kỳ này.
- **Top món/bundle/options**: completion snapshot, ID/type của món; thiếu dữ liệu hiển thị coverage. Không nhóm chỉ theo tên, không cộng giá combo con hai lần.
- **Giờ cao điểm**: created/accepted/round time theo câu hỏi xếp ca; không lấy payment time làm thời điểm làm món.
- **Sửa/đổi và quay lại**: event thay đổi có loại; khách định danh trong tenant. Định nghĩa 回購率 vẫn cần chốt theo kế hoạch analytics trước.
- Lịch sử trước cutover: PICKED_UP và PAID được nhận diện “đã hoàn tất theo trạng thái cũ”, completedAt/collection không biết thì null. Có thể báo cáo riêng theo createdAt kèm nhãn; không ghép âm thầm vào trend theo completedAt.

## 5. Chuyển đổi và tương thích

### 5.1 Mapping

| Legacy | Canonical | Điều kiện / giữ lại |
| --- | --- | --- |
| PENDING_PAYMENT | PENDING_PAYMENT | Giữ publication gate; xem payment để phân biệt đang chờ/đã hủy/failed, không tự phát đơn |
| NEW | NEW | Không tự coi đã nhận |
| ACCEPTED | ACCEPTED | Giữ thông tin bàn/round |
| DONE | READY | Không tính hoàn tất |
| PICKED_UP | COMPLETED | evidence legacy_status; tiền/thời điểm không tự suy |
| PAID | COMPLETED | evidence legacy_status; không tạo receipt; bảo tồn raw legacy status |
| REJECTED/FORCE_REJECT/CANCELLED | CANCELLED | Lưu original status/reason; không phát refund |
| EXPIRED | EXPIRED | Không suy thời điểm hết hạn nếu thiếu |
| WAITING_CUSTOMER_* | resume state + pendingAction | Cần action hiện tại/nguồn trước đó; không đủ dữ liệu thì review hold, không mặc định đưa vào hàng NEW |
| Giá trị khác | review hold | Không tự map thành đơn active hoặc completed |

Đơn payment đã CANCELLED/FAILED nhưng còn order PENDING_PAYMENT: chỉ đóng cổng khi đã chứng minh không có capture. UNKNOWN/confirm đã bắt đầu phải reconcile, không ép terminal theo tuổi đơn.

### 5.2 Lộ trình có điểm kết thúc tương thích

1. **Chuẩn bị contract và sửa ranh giới ghi:** giữ release hold. Làm auth/session cho POS bao gồm tenant không dùng staff-ordering, shared policy, revision và operation ID; không phát hành một nửa rule giữa các route.
2. **Schema thêm và đọc shadow:** tạo canonical projection không đổi UI; dry-run mapping theo tenant, đo mismatch. Existing rows không phát receipt/LINE; ghi provenance rõ. Partial/ambiguous mapping là gate lỗi cần xử lý, không âm thầm fallback.
3. **Chuyển tất cả writer:** legacy API thành adapter command, staff/LINE/payment publication cùng policy. `orders.status` chỉ projection compatibility. DB guard chặn writer cũ bỏ qua canonical; metadata-only updates vẫn được whitelist. Trong rolling deploy, instance cũ có thể nhận conflict/retry thay vì làm sai canonical.
4. **UI mới:** đọc order_state; tile/modal/history/tables/payment result/receipt đồng bộ. Snapshot/print không dùng order PAID để báo đã thu. Bump cache-buster. Triển khai Dev, test rồi Staging; test browser và APK thật với cache cũ + mới.
5. **Pilot và Production:** bật config tenant sau khi mapping sạch, ma trận nghiệm thu đạt, baseline/reconciliation đo được. Refresh snapshot/version trước deploy. Candidate cũ không còn dùng.
6. **Bỏ alias:** đo request cũ theo endpoint/client version, job/webhook/export. Sau cửa sổ tối thiểu 30 ngày và không còn legacy writer thực trong cửa sổ đó, vô hiệu hóa mutation status cũ; client không tương thích nhận UPGRADE_REQUIRED, không ghi sai. Thời hạn dài hơn nếu có thiết bị chưa cập nhật. Xóa order PAID trong contract/schema cuối cùng sau inventory sạch; raw audit text và payment PAID được giữ.

Trong giai đoạn 3–5, API V1 có thể chiếu COMPLETED thành PICKED_UP cho takeaway và PAID cho dine-in để client cũ không mất đơn. API V2 không có order PAID. Đây là alias tạm thời có telemetry và hạn loại bỏ, không giữ hai state machine hoạt động độc lập. Alias mutation không được vượt quyền; client cũ chưa có session phải refresh/login, không mở bypass để tương thích.

Tương thích đọc không có nghĩa mọi bản client cũ vẫn được ghi. Complete/collect/refund thiếu operationId hoặc expectedRevision phải nhận UPGRADE_REQUIRED để tải UI mới; server không tự lấy revision mới rồi coi như nhân viên đã xác nhận tổng mới. Adapter chỉ xử lý request đáp ứng contract an toàn, và không suy receipt từ alias PAID. Hàng mapping chưa đủ bằng chứng giữ `order_state` null với `migration_review_required`, bị chặn command và có danh sách review riêng cho người có quyền; không âm thầm biến thành NEW hoặc làm mất khỏi tầm nhìn vận hành.

### 5.3 Xử lý 0088/0089 đã lên Dev

- Theo yêu cầu bắt đầu lại ngày 2026-11-14, đã thu hồi hai migration thử nghiệm khỏi Dev và lưu baseline vào bảng archive; xem STATUS.md. Không tái sử dụng số 0088/0089; schema mới dự kiến 0090+ sau khi kiểm tra nhánh tại thời điểm implementation.
- Bỏ trigger suy collection từ status PAID trước khi chạy backfill/mapping; thay guard theo canonical completion và receipt chứng thực. Lưu event cũ, đánh dấu nguồn suy luận v1; không coi mọi manual:collected ở Dev là tiền đã xác nhận nếu thiếu evidence.
- Giữ phần audit status/payment events có ích, cải thiện actor/operation/provenance. Tách financial facts mới khỏi view v1 dễ hiểu nhầm; sửa API lifecycle và ETag version.
- Production hiện mới đến 0087 theo snapshot trước. Không promote 0088/0089 độc lập rồi để trigger cũ chạy một thời gian. Package schema→correction→backend là một rollout đã rehearsal; kiểm chứng công cụ commit theo file/batch. Nếu không bảo đảm cùng boundary thì dùng cửa sổ chặn ghi ngắn có đo đạc, không giả định nhiều file migration tự atomic.
- Backfill/alias projection không được bị trigger hiểu là completion mới. Synthetic migration tests phải chứng minh số receipt/outbox không tăng. Không chạy lại tenant seed.
- P2 direct INSERT PAID trước đây được hoãn sẽ bị loại đường sinh trong thiết kế mới: create không nhận terminal status từ client; historical import có quyền/mode riêng không tạo receipt. Không mang khoản nợ này sang canonical mới.

### 5.4 Rollback

Rollback UI về bản **có adapter/session và đọc canonical**, không về Worker cũ cho phép gán status tự do. Giữ bảng/event/mapping đã tạo, không restore toàn D1 làm mất đơn mới. Nếu có mismatch hoặc tiền sai: tắt thao tác bị ảnh hưởng cho tenant, đối soát bằng operation IDs, giữ payment reconciliation chạy; không tự gửi lại charge/refund. Sau canonical cutover, backend cũ không còn là rollback an toàn nếu không có compatibility guard. Playbook rollback candidate trước chỉ là tư liệu, không áp dụng nguyên xi.

## 6. Lựa chọn và đánh đổi

| Phương án | Ưu điểm | Nhược điểm / quyết định |
| --- | --- | --- |
| Đổi mọi PAID thành PICKED_UP | Ít đổi frontend | Tên sai cho dine-in; không sửa receipt inference, auth, callback, race; không chọn |
| Bỏ order PAID, giữ PICKED_UP là terminal chung | Ít enum đổi; phù hợp takeaway | Khả thi để giảm phạm vi, nhưng dine-in/báo cáo vẫn cần diễn giải; chỉ dùng như adapter tạm |
| Canonical COMPLETED + tiền độc lập + adapter có hạn | Ngữ nghĩa rõ, cùng rule mọi nguồn, giữ UI | Phải chuyển reader/writer và migration đồng bộ; **chọn** |
| Viết lại toàn bộ payment engine/event sourcing | Linh hoạt tối đa | Tăng rủi ro với provider và chi phí không phục vụ requirement; không chọn |

Đây là thay đổi vừa đến lớn ở miền đơn hàng; phạm vi gồm backend orders/staff/LINE/payments/tables/reports/types + schema, POS live/modal/history/core/payment/result/print/I18N + HTML cache, tests và export. Không phải một patch đổi enum và không cần đổi Rust pricing. Thay đổi runtime chỉ bắt đầu theo các mốc bên dưới; tài liệu này không tuyên bố đã hoàn thành implementation.

## 7. Quan tâm xuyên suốt

- **Quyền:** POS session bind tenant, revoke/expiry; quyền riêng hoàn tiền; webhook signature + order owner + action scope. Không log token, raw LINE user ID hoặc thông tin thanh toán nhạy cảm.
- **Quan sát:** command accepted/replayed/conflict, invalid transition, stale callback, legacy alias usage, completion/receipt duplicate, canonical mismatch, refund attention. Log operationId/tenant/order/revision/actor type và code lỗi, không dựa log làm nguồn tiền.
- **Hiệu năng:** index theo tenant và khóa replay; không N+1 enrichment; aggregate theo range có giới hạn. Đo D1 rows read/latency bằng fixture đại diện và Dev. Không dựng rollup/cache báo cáo trước khi có benchmark cần thiết.
- **Side effect:** commit durable outbox trước gửi; retry LINE/Sheets không được ghi lại command/receipt. Exactly-once business record không đồng nghĩa mạng gửi tin exactly-once; dùng idempotency nơi dịch vụ hỗ trợ, ghi nhận delivery state.
- **Ngôn ngữ/thiết bị:** zh-TW/vi đồng nghĩa, nút POS ≥48px, browser và APK cùng contract. Không dùng badge “đã trả” chỉ từ trạng thái phục vụ.

## 8. Kế hoạch phát triển

| Mốc | Đầu ra | Gate |
| --- | --- | --- |
| R0 — Contract | State/payment/command dictionary, UI action semantics, mapping fixtures | Chốt ý nghĩa thao tác thu tiền; đủ expected results cho takeaway/dine-in/LINE Pay |
| R1 — Authority | Shared command service, session, CAS/idempotency, terminal guard | Mọi legacy/staff/LINE writer hoặc dùng service hoặc bị DB fence chặn; không có bypass |
| R2 — Data | Schema canonical, completion, manual entries, correction 0088/89, migration dry-run | Mapping không tạo receipt/thông báo; unknown có provenance; rollback rehearsal |
| R3 — UI + payment orchestration | Một thao tác complete, badge tiền độc lập, cancellation/refund coordinated, legacy adapter | Tile/modal/history/bàn/LINE receipt/in/Sheets đúng; callback/retry/race đạt |
| R4 — Nghiệm thu | Dev → Staging, browser + APK thật, release gate, reconciled aggregates | Không claim readiness bằng test PAID cũ; xử lý mọi P1 và hiện rõ dữ liệu chưa biết |
| R5 — Analytics + cleanup | Daily rồi weekly/monthly từ facts mới; sunset order PAID alias | 10 requirement analytics theo metric contract; coverage lịch sử; telemetry alias sạch |

R1/R2 được tích hợp và nghiệm thu trước cutover writer; không deploy service đòi schema chưa tồn tại. R0 chưa chốt cách thu không cản schema/probes và thiết kế auth, nhưng không triển khai auto-confirm cash bằng giả định. Reports auth có thể dùng chung session authority ở R1. Analytics chi tiết tiếp tục theo DEVELOPMENT_PLAN với các điều chỉnh lifecycle ở đây.

## 9. Ma trận nghiệm thu mới

| Tình huống | Kết quả phải đạt |
| --- | --- |
| Takeaway manual, chỉ complete | COMPLETED một lần; không tự receipt; biến mất live, vào history |
| Takeaway manual, confirm money + complete | Receipt/completion cùng commit, đúng tổng/revision, actor; không cần order PAID |
| Dine-in, staff và legacy | Cùng canonical COMPLETED; giải phóng đúng bàn; không ảnh hưởng bàn tenant khác |
| LINE Pay paid nhưng chưa nhận | Order NEW, payment PAID, chưa có completion |
| LINE Pay → giao | COMPLETED, receipt LINE Pay chỉ một; không manual collection |
| Lost response / double click / 2 thiết bị | Replay hoặc revision conflict; một completion/receipt, không double side effect |
| Stale total/detail hoặc cạnh tranh append/complete | Chỉ một kết quả hợp lệ commit; không chốt tổng cũ với snapshot mới |
| Unknown status / terminal → active / arbitrary INSERT PAID | Reject trước side effect; không tạo khoản thu |
| Stale LINE postback / sai owner / action đã đóng | Không thay status/total; response phù hợp, không nói đã thực hiện khi DB từ chối |
| Cancel đơn đã thu trước giao | CANCELLED + attention refund; tiền chưa hoàn vẫn nguyên |
| Refund pending/failed/lost response | Không giảm net thu trước xác nhận; không post refund lặp khi chưa biết kết quả |
| Full refund trước giao / sau giao | Trước: CANCELLED; sau: COMPLETED + refunded; cạnh tranh được serialize |
| Manual refund lặp/vượt thu/sai tenant | Reject; balance đúng, audit không mất |
| Old PAID/PICKED_UP/ambiguous pending | Mapping chỉ completion evidence lịch sử; timestamp null khi không biết; review hold cho ambiguous |
| Old cached browser/APK | Adapter đúng, session bắt buộc; không double collect; refresh/version có thể kiểm tra |
| Post-completion late UPSERT/item/snapshot | Không đổi giá/món/trạng thái; metadata whitelist vẫn dùng được |
| Reports | READY/REJECTED không doanh số; cùng cohort cho AOV; refund khác ngày, ngày 0, timezone, anonymous customer |
| Không session / hết hạn / revoke / sai tenant | Command/report từ chối ở server; không bypass qua legacy route |

Dùng DB cục bộ dùng một lần để test ghi lặp; payment provider mock cho crash/races. Sau đó targeted D1/Miniflare integration, static checks, full release gate cuối cùng, smoke read và nghiệm thu UI thật trên Dev/Staging. Không tự charge/refund thật để kiểm thử. Kết quả probes hiện có chỉ chứng minh lý do cần sửa, chưa đạt bất kỳ gate triển khai mới nào.

## 10. Điểm cần xác nhận nghiệp vụ

Chỉ còn một lựa chọn quyết định UX thu thủ công: nút hoàn tất hiện tại có xác nhận nhận đủ tiền hay chỉ giao món? Trong khi chưa có câu trả lời, thiết kế tách hai sự kiện và không tự ghi receipt. Việc loại order PAID, thống nhất COMPLETED, sửa authority/guard và mapping lịch sử không phụ thuộc việc đoán câu trả lời này.
