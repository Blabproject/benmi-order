# wuqiji corrected reference menu

Source: the user's second image, `codex-clipboard-457aa75b-5c4a-458e-91be-b6da4005b960.png`. It supersedes the first image and all provisional combo assumptions in `wuqiji-options-fix-20261110`.

| Items | Required choice |
| --- | --- |
| 酥皮雞排, 脆皮雞排 | Exactly one of 原味、甘梅、檸檬、起司、辣味 |
| 脆薯條, 波浪薯條, 細薯條 | Exactly one of 原味、甘梅、起司、辣味 |
| 加購升級 A-D | Exactly one of the five existing teas, zero surcharge |
| Other products, including combo E | No flavor/drink group |

All required groups open automatically and have no preselected choice. Fries use an explicit four-option subset of the five-option flavor group. Links attach to exact item IDs; no category-wide option inheritance is used.

Combo E is corrected from 240 to **340** and its name/description to `雞腿塊翅組合餐 (6塊)`. Names `脆薯棒` and `細薯棒` are corrected to `脆薯條` and `細薯條`. Other catalog fields and tenant configuration are preserved. The full seed retains the tenant's supplied LIFF ID for initial creation and preserves existing credentials/LIFF on upsert.

Validation includes repeated SQLite seed application using the saved schema of all three environments; foreign key checks; the real backend graph/selection validator with 42 valid choices per environment; rejection of missing, excessive and snack-only disallowed lemon choices; and 14 mobile browser cases with the projected catalog. `*-verification.json` records live environment checks after each apply. Configuration hashes ensure credentials and LIFF are unchanged by the menu patch.

`correct-options.sql` is the incremental patch. The canonical full seed `benmi-worker-official/seeds/tenants/wuqiji.sql` includes the same correction. The completed rollout invalidated four tenant cache keys and verified fresh/cached bootstrap and the options API. After validation, temporary execution helpers, browser screenshots, local SQLite databases and duplicate API responses were removed during artifact cleanup. The desired rules, pre-change menu snapshots and final validation reports remain. For a future change, use the current tenant-menu-seeder workflow and the project's `scripts/cloudflare-d1.cjs` helper with a fresh snapshot of the selected environment.
