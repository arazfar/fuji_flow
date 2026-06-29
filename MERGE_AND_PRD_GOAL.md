# Goal: Merge Upstream Work and Continue PRD Implementation

## Objective

Merge the current local prototype work with teammates' upstream changes, preserve all useful behavior from both sides, and continue implementing as much of `PRD.md` as practical. Keep the repository in a working state after each commit and use semantic commits for all work.

## Current Local Work To Preserve

- Server-side OpenAI task extraction for messy voice/text dumps.
- Structured task metadata including category, location relevance, location context, presence value, privacy risk, delegation recommendation, confidence, and rationale.
- OpenAI request timeout handling.
- Client-side voice dump task extraction through `/api/extract-tasks`.
- Task cards showing location context and location-dependent tags.
- Local storage reset from `clarity-queue-state-v1` to `clarity-queue-state-v2`.
- Inbox `Clear tasks` button that clears tasks, questions, selection, active run, and sharpen queue.

## Merge Strategy

1. Inspect the local tree before touching upstream:
   - `git status --short`
   - `git diff --stat`
   - `git diff --cached --stat`
2. Preserve WIP before merging:
   - Prefer committing coherent local work first if it is ready.
   - If the tree is not ready to commit, stash with a descriptive message including staged changes.
3. Fetch upstream:
   - `git fetch --all --prune`
4. Identify the integration target:
   - Confirm the current branch and upstream branch with `git branch -vv`.
   - Merge or rebase according to the team's branch convention.
5. Resolve conflicts by preserving product behavior, not blindly taking either side.
6. After each conflict resolution:
   - Run `npm run check`.
   - Smoke test the app at `http://127.0.0.1:5178`.
7. Keep `PRD.md` as the implementation source of truth. If it remains untracked, decide explicitly whether it belongs in the repo before committing it.

## Semantic Commit Plan

Use small, reviewable commits. Good commit groups:

- `feat: add OpenAI task extraction`
- `feat: add task clearing control`
- `chore: reset local storage namespace`
- `feat: implement plan day shell`
- `feat: improve recommendation summaries`
- `feat: add OpenAI task understanding`
- `fix: preserve location context in task extraction`
- `docs: add product requirements`

Do not mix unrelated UI, backend, docs, and merge-conflict cleanup in one commit. Run `npm run check` before each commit whenever possible.

## PRD Implementation Priorities

1. Ensure task capture is fast and persists after refresh.
2. Ensure each task receives structured metadata from OpenAI when configured.
3. Require `OPENAI_API_KEY` for AI task understanding and agent workflows; use test mocks only for automated coverage.
4. Generate useful sharpening questions for each task.
5. Rank questions using PRD factors:
   - expected value
   - urgency multiplier
   - confidence gap
   - ease multiplier
   - annoyance penalty
   - staleness penalty
6. Improve the recommendation panel so it shows:
   - counts by recommendation type
   - delegatable tasks
   - presence-required tasks
   - unclear tasks
7. Add a lightweight `Plan Day` button or disabled MVP shell if not already present upstream.
8. Improve habit insight logic using completion, answer, speed, skip, and abandonment signals.
9. Keep agent workflow behavior:
   - context questions first
   - clear plan
   - explicit approval before action
   - concrete next steps when direct completion is not feasible

## Acceptance Checks

Before considering the goal complete:

- `npm run check` passes.
- The app starts with `npm start`.
- Adding a typed task creates a task and questions.
- Voice/text dump extraction creates separate atomic tasks.
- Location context like "while I am there" is preserved.
- Relationship-presence tasks are not carelessly delegated.
- `Sharpen 2 min` and `Sharpen 5 min` show ranked pending questions.
- Answering a question updates task confidence or recommendation.
- `Clear tasks` resets the visible task list and pending questions.
- Refresh preserves active tasks unless deliberately cleared.

## Commit Discipline

- Commit only intentional files.
- Do not commit secrets, local environment files, or generated noise.
- Treat teammate changes as authoritative unless they conflict with the PRD or break existing behavior.
- If a conflict requires product judgment, document the decision in the commit body.
- After the merge and implementation work, leave `git status --short` clean except for explicitly deferred files.
