# Order code presentation change — 2026-11-09

Implemented locally. No deployment, D1 write or identity migration was performed.

- Shared `js/order-code.js` formats recognized `MMDD-[DT]sequence` suffixes and strips leading hashes. UUIDs and unknown legacy references remain intact.
- Applied to POS live/history/review/table/payment views, staff checkout, customer append/edit/payment views, receipt/sticker/browser print previews, LINE cards and notification captions.
- Stored `key`, `order_id`, `display_key`, counter generation, payment references, idempotency values and action URLs are unchanged. Checkout text preserves its canonical stored header and the exact `訂單參考` reference.
- POS history searches by the visible code even when the storage key is a UUID.
- All affected browser asset references have cache busters; formatter loads before consumers in index, orders and payment-result HTML.

Validation:

- `final-tests.log`: 71 related tests passed (display, LINE, printing, history, payment API, table and staff contracts).
- `identity-tests.log`: 19 real-source/local D1 identity checks passed, including legacy keys, retries, same-prefix stores and LINE action references.
- Frontend static/scope checks and backend TypeScript check passed.
- Two checks in `tests/test_liff_edit_order_submit_state.cjs` fail with both current and original HEAD checkout source. `edit-order-baseline.log` records the same pre-existing disabled-state assertion and missing `emptyCart` fixture failure; this unrelated test was not modified.
- Graphify update run after changes; see `graphify.log`.

## Self-review fixes

- LINE text retains the original `訂單編號` lookup header and places the short code in a separate `取餐號碼` label. API-success fallback uses the original server key even when it is a UUID. Offline-create fallback also retains its original reference.
- Added the shared formatter to the standalone checkout, printer-system and printer-sequence fixtures.
- Added actual checkout submission assertions for both prefixed and UUID keys, plus real local-D1 replay of generated checkout messages against the legacy LINE handler. Replays preserve record count, UUID, key, amount and recipient.
- `review-fixes-identity.log`: 20 checks passed, including the new regression that previously created a duplicate.
- `review-fixes-tests.log`: 26 tests passed; the printer-system script additionally reports all 14 internal checks passed.
- `review-fixes-check.log`: frontend static/scope checks passed. Checkout asset cache buster bumped to v2.
- Still local only; no production writes or deployment.
- Broader fixture audit also added the formatter to customization-price, option-display and receipt-layout tests. Updated the receipt expectation to the short code while asserting the original key remains unchanged; supplied the receipt-layout fixture's missing window event stub.
- `review-fixes-related.log`: 19 additional related tests passed, including LINE retry and customization/printing regression coverage.
- An unrelated untouched fixture, `test_zhadantongxue_no_bundle_duplication.cjs`, still lacks `window.addEventListener` for orders-core initialization. It was observed during the broader audit and is outside these changes, alongside the previously documented edit-order fixture failures.
