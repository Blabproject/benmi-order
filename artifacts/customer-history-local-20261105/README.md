# Customer history local preview — 2026-11-05

Run from the repository root:

```sh
node artifacts/customer-history-local-20261105/run.mjs
```

The runner bundles the actual Worker, applies repository migrations to disposable local D1, seeds a synthetic restaurant and orders, and drives the actual frontend with Chromium. Only LINE identity is simulated. Browser API calls are routed to Miniflare; the development hostname is a virtual browser origin, not a deployment. Third-party requests and order/payment/message writes are blocked. The browser and local services close when the run completes.

The run verifies pagination, owner isolation, invalid-token rejection, repricing, changed/unavailable options, duplicate lines, merging with quantity limits, preservation of portion notes, and cancellation of an in-flight apply. See report.json for actual checks and request statuses.

Screenshots:

- 01-history-mobile.png — Customer history
- 02-order-detail-mobile.png — Original order detail
- 03-reorder-preview-mobile.png — Reorder summary and current total
- 04-reorder-items-mobile.png — Available and excluded items, apply action
- 05-reordered-cart-mobile.png — New cart after reorder
- 06-history-desktop.png — Desktop layout
- 07-merge-preview-desktop.png — Merge with an existing cart
