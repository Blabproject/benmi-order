# Pickup and database release repair

Main: 9e13302a3be1d9803025d4b8eb1c3abf841d8b0b. Production deployment: 42f4c0e0-895a-4d65-bf63-9da6307a4e8a.

The mixed commit 65a94af0 was reversed through a new commit, then the previously released frontend fixes were merged. Pickup was reintroduced in the five-file commit 3404fc4a, with operating-hours guards and test registration in 619900b3. The D1 migration file is tracked separately in 3d65ba20. Shared Git history was not rewritten.

Customer history is preserved on codex/customer-order-history-isolated (f1a10c4c422233269ada121025092b3451dae87f); the original tree remains on codex/archive-mixed-pickup-65a94af0. History API/UI was not deployed.

Production D1 already recorded 0079 at 2026-11-06 17:26:54 UTC (2026-11-07 02:26:54 JST). Index columns and DESC ordering were verified; EXPLAIN confirms covering-index use. The cf migration list is empty. No DDL, seed or order-data writes were needed.

All 35 release groups are accepted. The original full run hit a Miniflare-startup fetch failure in WebKit; an unchanged-source rerun passed all three tests. Original result, retry and acceptance are preserved separately.

Only four pickup frontend files and release metadata changed in the Pages payload. Existing worker bundle and 76 other static assets were preserved. Fifteen live reads matched; real Chrome confirmed the new modal and no history entry. Browser verification opened the picker without creating an order.

Primary checkout is synchronized to main. Its previous generated graph is backed up and preserved in stash 34696f19479f40ee017b957ee597d2d71057b620. Rollback Pages target: 561ee3e5-2b71-4c77-8fe7-0818250000cf.
