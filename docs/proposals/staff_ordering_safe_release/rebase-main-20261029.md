# Staff ordering rebased onto production — 29 October 2026

The user authorized the complete integration, a new feature branch, force-updating `dev`, and migrating the dev database. This supersedes the earlier one-task-at-a-time release sequence for this integration. Production/staging rollout and enabling tenant capabilities remain separate.

## Provenance and preservation

- Source: `origin/staff_dine_in` at `97708e8e20c8b19db7045ac4013d447940d5b38f` (four feature commits).
- Production base: `e0098a9dc44ca6766386c3a4722606747b87abf6`.
- Dev before integration: `d1c799c63365e0e207c30ebfd820bada3571961f`; no dev-only commit relative to production at inspection.
- Branch: `codex/staff-order-rebase-main` in its own worktree. Local backups: `backup/staff-before-rebase-20261029`, `backup/dev-before-staff-rebase-20261029`.
- All four source commits were replayed. Conflict resolution retains production's TenantRepository, menu/schema, snapshots, LINE receipts, identity, printer reliability and cf deployment configuration. The staff admin flag is carried through TenantRepository rather than restoring obsolete inline SQL.
- Main workspace edits to `orders.html` and `css/orders.css` were left in that workspace.

## Runtime and UI

Staff PIN login/logout, PIN session revocation, table selection/filters, per-table drafts, table CRUD, initial ordering and additional rounds are integrated. The standalone tablet/mobile staff page uses the current canonical option picker and typed order selections. Tablet landscape keeps the cart beside the menu. POS table management and staff actions are localized in Vietnamese and Traditional Chinese.

Every business API requires the tenant's master flag, its specific boolean capability, and a tenant-bound staff session. Missing schema/keys close access. Capabilities: `session`, `tables_read`, `tables_write`, `orders_read`, `create`, `append`, `status`, `pos_entry`, `auto_print_new`, `auto_print_round`. Missing keys and non-boolean values do not enable access. Staff responses are `no-store`.

Staff creates and appends reuse production catalog validation and immutable detail snapshots. Order, snapshot, item projection and idempotency result commit together. Prices cannot fall back to client values. A request ID persists across an uncertain delivery and replays the committed result. Conflicting request contents are rejected.

`PATCH /api/staff/orders/:reference/status` accepts `{status, expectedRevision}`. Append and status updates share staff revision concurrency checks. Existing customer/legacy mutation endpoints reject staff orders. POS reloads on a conflict and asks for another action instead of applying a stale local status.

Staff auto-print is separately gated. Only requested rounds are sent, with one attempt per tenant/order/round/station. Overlapping polls are serialized per round. Failed attempts remain available for explicit manual reprinting without an automatic loop.

## Dev migration and deployment procedure

Target only `blab-db-dev` (`40b67d8a-29e0-40c1-9ce2-b76f76864e95`), mode `dev`, using Node 24 and cf.

1. Snapshot schema/ledger, tenant flags and aggregate staff/order counts. Confirm all existing migrations through `0072` are recorded.
2. Apply only `0073_staff_order_transaction_guards.sql` from an isolated migration directory. It adds session PIN fingerprints, scopes staff revision checks to business-column updates, installs transactional table guards, and makes the unique table-occupancy index agree with terminal statuses. It does not enable a tenant or rewrite historical orders. The staff revision guard excludes the existing identity-fill trigger's identity-only update.
3. Verify ledger, trigger definitions, column and index. Confirm tenant flags and order/table/session/request counts match the pre-migration snapshot.
4. Publish the feature branch, preserve the previous dev head remotely, and push the tested result to dev with an explicit `--force-with-lease=refs/heads/dev:<observed SHA>`. If the lease fails, inspect new commits before proceeding.
5. Verify CI and deploy the Worker with `npm run deploy:dev` if the Git integration has not deployed that same revision. Confirm `/api/health` identifies the tested SHA and dev environment, and the Pages dev preview serves the staff assets.
6. Read-only checks: health, catalog/bootstrap, POS orders, and closed staff capabilities for all tenants. Never run the generic live smoke script here: it includes menu mutations outside the demo tenant.

The first D1 query returned Cloudflare 7403/403; a subsequent query succeeded using the existing cf OAuth session. No credential change was necessary. At preflight all 16 tenants were disabled with `{}` capabilities, 2,702 legacy orders and no staff orders; dev had no legacy staff revision trigger.

## Inherited release-baseline repairs

The production base's CI run `40723365770` already failed POS display, WebKit tablet layout, mobile detail clearance and menu typography contracts. The integration gate reproduced those failures. Repair long receipt identifiers and translated action wrapping without changing the squircle button layout, restore 96px mobile detail bottom clearance, and make mobile menu pixel font declarations honor the existing menu font scale. Existing regression assertions remain intact.

## Validation and remaining rollout gates

- `npm run check`, backend TypeScript, cache-buster comparison against the production base.
- Real local D1: closed permissions, tenant isolation, sessions/PIN/logout, table CRUD, server prices/options, immutable snapshots, replay/collisions, guarded customer APIs, transaction rollback.
- Twenty repetitions each of same-table creation, concurrent append, and append versus payment; projection totals/snapshots stay consistent.
- Migration on both a production/dev baseline and the old staging trigger; legacy writes and existing records preserved.
- Chromium and WebKit, 1024×768, 768×1024 and 390×844, both languages. Includes uncertain-delivery replay, and conflict/review/resubmission while preserving the cart.
- Printer round/station deduplication and failure behavior; POS staff revision actions and legacy action compatibility.
- Full `npm run test:release` is the final publication gate. Logs/screenshots are under ignored `artifacts/release-baseline/`.

Hardware printer validation, enabling any capability, staging rollout and reconciliation of existing staging staff data are pending. The demo tenant remains `blab_demo`, selected through configuration; no tenant is hardcoded into runtime behavior.

Rollback: keep the additive schema. While there are no staff orders, the previous dev code can be restored. After staff orders exist, retain a revision-aware runtime for reads/status actions, close create/append/printing capabilities first, and reconcile open orders before reverting further. Never delete the migration ledger or restore all of D1 to undo this feature.

Final local release gate: **30/30 suites passed**, evidence directory `artifacts/release-baseline/2026-10-28T18-10-56-191Z`. This includes refreshed-price/conflict review and explicit resubmission, and printing every unseen round when the first poll observes multiple rounds. Hardware printing and tenant enablement remain separate gates.
