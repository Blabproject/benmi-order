# Cart portion action alignment — local verification

Run from the repository root:

```sh
HISTORY_PREVIEW_OUTPUT_DIR=artifacts/cart-actions-local-20261105 node artifacts/customer-history-local-20261105/run.mjs
```

Uses the actual frontend and bundled Worker with disposable local D1 and a simulated LINE identity. No production requests, order submissions or LINE messages.

Checks button geometry at 320, 375, 430 and 1280 px: edit/remove stay on the same line, maintain an 8 px gap and minimum 48 px touch targets, line up at the right edge of each portion, and do not overlap long option/notes text. The existing pagination, ownership, reorder, merge and cancel checks also run.

Screenshots:

- 05-reordered-cart-mobile.png — 430 px
- 08-cart-actions-375.png — 375 px
- 09-cart-actions-320.png — 320 px
- 10-cart-actions-desktop.png — 1280 px

See report.json for the observed check results.
