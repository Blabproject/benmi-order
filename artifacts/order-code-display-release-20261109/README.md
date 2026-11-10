# Order code production release — 2026-11-09

Commit: `03defafd96c645b4af5186ab0670e6660650a631` (pushed to main).

Frontend: Cloudflare Pages `dfd95202-8536-4ec6-86ba-167f1c614299`, production success.
Backend: Worker version `a90dec27-c2d2-45b5-b021-36f7e9b5568b`, production health reports the same commit.

The isolated release commit passed the 35-suite local release gate with one isolated retry: the original full run was 34/35 due to a local Miniflare startup `fetch failed`; that same runtime suite passed both tests when rerun, without source changes. Original results remain intact under the release worktree and in `release-validation.json`.

Production verification matched SHA-256 for all 14 changed/new JavaScript assets. Real deployed POS code rendered short takeaway/dine-in labels, retained the UUID for review actions and printed the short label without exposing the original prefix. The customer page loaded checkout v2 and the shared formatter. Browser verification used synthetic local view data and read-only API requests; it created no orders, charges or LINE messages.

No D1 migrations or tenant updates were performed. Public LINE Pay config still reports configured=true with the tenant paused. Root main was synchronized to the release commit while preserving pre-existing Graphify changes, menu seed and other local artifacts.

Evidence: `verification.json`, `verification.log`, `production-pos.png`, `deployment-summary.json`, `worker-deploy.log`, `pages-deployment-after.json`.
