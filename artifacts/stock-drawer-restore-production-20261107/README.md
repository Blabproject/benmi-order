# Restore saved stock drawer choices

Production deployment: f3516d7d-86fa-4449-b1cf-ecf2d89cc1e1. Source commit: a28f4fde2291a6b5300bad897402102cddee5c93.

Fixed selection reset when reopening the stock drawer. The menu editor retains the saved expiry, restores the radio/date controls, and remembers only the display distinction between today's cutoff and an explicitly chosen identical date. Browser storage is tenant/entity scoped and is used only when it matches the saved expiry. Failed or cancelled writes do not overwrite the saved choice.

Only js/orders-menu.js and its cache version in orders.html changed, plus release metadata. Backend, menu data, other assets and APKs were preserved.

Validation: 35/35 release suites; isolated release source WebKit/D1 reload tests; live downloaded UI reopen checks on Chromium/WebKit, phone/tablet and both languages; nine live asset/domain reads. Browser verification mocked stock writes.

Rollback: a7a427b3-d0f1-4a9a-bd75-f4fd615a61c0.
