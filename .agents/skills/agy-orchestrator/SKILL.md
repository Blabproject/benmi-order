---
name: agy-orchestrator
description: Plan, delegate, and verify tasks with Codex as coordinator and one or more Antigravity workers through the agy CLI. Use when the user asks Codex to lead work executed by Antigravity, including parallel workers and follow-up corrections.
---

# Antigravity Orchestrator

Codex owns discovery, the plan, task boundaries, coordination, integration, and acceptance. Antigravity performs assigned implementation or research through `agy`. Keep the user informed in their language.

## Establish the task

- Read applicable project instructions and inspect current changes before planning. Honor local discovery rules, such as Graphify-first, in both Codex and worker briefs.
- Establish the outcome, allowed writes, acceptance checks, dependencies, and existing authorization. Resolve material product questions with the user; answer discoverable questions by inspecting the environment.
- Produce a plan proportional to the task. Existing authorization to implement is sufficient; do not introduce another approval gate. In Codex Plan mode, limit workers to explicitly read-only investigations: delegation cannot bypass the current mode, permissions, or scope.
- Use one worker by default. Add workers when independent work justifies the overhead. Read [parallel-workers.md](references/parallel-workers.md) before concurrent execution.

## Prepare the handoff

1. Confirm `agy` is installed and inspect `agy --help` for the installed flags. Do not install, update, or reconfigure it implicitly.
2. Capture a baseline for the assigned workspace: status/diff, relevant input versions, and the content or hashes needed to distinguish worker changes from existing user work. Back up preexisting changes to generated artifacts before regenerating them. Store run records outside the repo unless the user requests otherwise.
3. Fill [worker-brief.md](references/worker-brief.md) with concrete paths, interfaces, constraints, acceptance checks, and a stopping condition for failures. Supply relevant context rather than the entire conversation. Implementation workers should implement the agreed plan; have them report material design changes before expanding scope.
4. Keep the configured Antigravity model and effort unless the user specifies them or authorizes a selection. If a choice is needed, inspect `agy models`. Distinguish a requested model, a configured default, and a model verified in session metadata; do not invent a model name from the available-model list.

## Run and communicate through agy

Use the bundled helper to avoid shell interpolation of prompts and preserve complete NDJSON logs. `SKILL_DIR` below means this skill's resolved directory, not a fixed user path.

```bash
python3 "$SKILL_DIR/scripts/agy_worker.py" run \
  --cwd /absolute/workspace \
  --run-dir /temporary/task/worker-a/turn-01 \
  --prompt-file /temporary/task/worker-a/brief.txt
```

- Each invocation needs a new run directory. The helper runs in the foreground; use the host terminal's yielded session to keep working and poll it at intervals of at most 30 seconds. Send meaningful user updates at least every 60 seconds.
- The helper uses `--output-format stream-json --print-timeout 0s`. It records the `conversation_id`, stdout, stderr, last tool, requested model, final response, and process result. Inspect without starting another agent turn:

  ```bash
  python3 "$SKILL_DIR/scripts/agy_worker.py" status --run-dir /temporary/task/worker-a/turn-01
  ```

- Default to the account's configured mode. Pass `--mode plan` for a read-only worker or an explicitly requested supported mode. A CLI mode or `--sandbox` is not a substitute for the current authorization boundary. Some accounts reject `--mode auto` and continue in their default mode: inspect and report the effective behavior, and do not relaunch a task that is already running.
- Pass `--model`, `--effort`, or `--agent` to the helper only when appropriate to the user's instructions. Do not add `--dangerously-skip-permissions` or treat worker access as additional authorization.
- Wait for the current turn to finish before sending another prompt to its conversation. Send corrections to the same worker with a new run directory and its exact recorded ID:

  ```bash
  python3 "$SKILL_DIR/scripts/agy_worker.py" run \
    --cwd /absolute/workspace \
    --run-dir /temporary/task/worker-a/turn-02 \
    --conversation CONVERSATION_ID \
    --prompt-file /temporary/task/worker-a/correction.txt
  ```

- Use exact IDs, not `--continue`, which may target another worker or user session. Save the task-to-worker-to-conversation mapping so work survives context compaction.
- On missing authentication, an unavailable requested model, permission rejection, or a persistent CLI failure, report the concrete blocker. Do not silently replace Antigravity with Codex implementation or change the requested model.
- If a turn times out, disconnects, or lacks a final result, inspect the workspace and session state before retrying. An exited CLI is not proof that an Antigravity background tool stopped. Retry only after confirming that doing so will not duplicate writes or external actions; pause affected writers while the outcome is unknown.

## Verify and finish

- A helper result of `worker_reported_success` means the worker produced a completed success response. It does **not** mean the user's task passed acceptance. `SUCCESS` plus `print_timeout`, an empty response, or a missing terminal result is incomplete.
- Codex independently reviews the actual diff/artifacts and runs the checks required by the task and project. Attribute outside-scope differences against the baseline; investigate concurrent user edits rather than reverting them automatically. Review the worker's commands and warnings as well as its final prose.
- Send concrete failing evidence back to the same worker, within its assignment, then verify again. When retries repeat without new evidence, diagnose or report the blocker instead of continuing an unbounded loop.
- Integrate multiple workers only after checking their individual results and shared interfaces. Run the necessary integration/release checks once at the appropriate project gate. Let the designated owner update shared generated artifacts after integration.
- Report the result, material files, independent verification, and remaining limitations. Mention worker/model details only when known and useful. Retain logs and backups until the task is accepted; do not commit, push, deploy, or message others beyond the user's authorized scope.
