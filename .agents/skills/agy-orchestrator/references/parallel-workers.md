# Multiple Antigravity workers

## Partition before launching

Codex keeps a small task ledger outside the repo, for example:

| Worker | Assignment | Workspace | Write ownership | Dependencies | Conversation | Run directory | Acceptance |
|---|---|---|---|---|---|---|---|
| A | implementation slice | absolute path | explicit paths | inputs from plan | from init | unique per turn | checks and state |
| B | independent slice/review | absolute path | other paths or none | inputs from plan | from init | unique per turn | checks and state |

Use independent agy invocations as workers. Codex controls fan-out and follow-up; a new worker gets a new conversation. There is only one active turn per conversation. Give a new worker its inputs and contract, not another worker's entire transcript.

## Choose workspace isolation

- Read-only investigations can share a checkout. Stop relying on a result if its input files changed during the investigation; recheck the relevant facts.
- Concurrent writers should use separate worktrees/checkouts when they can touch the same files, dependencies, build outputs, or generated artifacts. In a shared checkout, allow concurrency only with demonstrably disjoint write ownership and no interfering commands. Serialize work when isolation costs more than the benefit.
- A worktree created from HEAD does not contain dirty or untracked user changes. Identify the intended starting state first and deliberately transfer only the assigned inputs if needed. Never stash, reset, or clean the user's work to simplify delegation.
- Assign one owner for shared files: HTML script lists/cache-busters, package/lock files, translations, schema changes, and generated indexes such as Graphify. Other workers report the required edits to that owner instead of modifying them concurrently.
- Build/cache/dependency directories can race even when source files differ. Use isolated output paths or serialize conflicting commands. Keep release/deploy operations under one explicitly authorized owner.

## Coordinate and integrate

Run independent workers concurrently using the host terminal tools; keep process/session IDs, run directories, and conversation IDs distinct. Use short polling intervals so the user still receives progress updates. Account limits or conflicts are reasons to serialize remaining work, not to change models or bypass permissions.

If a worker fails, continue independent assignments while holding its dependents. Resolve interface changes through Codex before either side implements a conflicting contract. Do not start another turn while the same conversation or its background tool may still be mutating shared state.

Review each worker's diff and checks against its starting state. Bring the accepted changes into the integration workspace sequentially, preserving the user's existing edits. Inspect conflicts rather than overwriting them, then verify the combined behavior. Follow the project's release gates and update shared generated artifacts after the source changes have been integrated.
