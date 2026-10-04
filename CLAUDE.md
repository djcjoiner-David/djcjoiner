# DJC Prod Sched

React + Vite single-page scheduling app (production/job scheduling for a joinery business), backed by Neon Postgres via a serverless API (`api/db.js`). Almost the entire app lives in one file: `src/App.jsx`.

## Working branch

All work happens on `claude/peaceful-brahmagupta-7poe1m`. Ship one fix at a time as its own PR against `main` (squash-merge), not one giant PR.

## The live bug/finding list

`TESTING_NOTES.md` is the running log of everything found during live QA: confirmed bugs, root causes, fix direction, and what's already shipped vs still open. **Read it first** - it has far more detail than this file, including exact line references and live-repro steps for anything not yet fixed. Each shipped fix gets its entry updated to `**FIXED.**` with a short summary of what actually shipped (not left as "deferred").

## The user's standing rules (apply every session)

1. Replies are clean, clear and simple. No jargon, no filler.
2. Anything more than a few lines is numbered, so the user can reply by number.
3. Read the whole prompt and respond to every part of it.
4. Make no changes until the user says so. Discuss first.
5. No shortcuts. This build has to be 100%.
6. Update `TESTING_NOTES.md` as work progresses. Write lessons so they can easily be reused in other projects (Part 1 = general, Part 2 = this app).

## Workflow that's been established

1. **Discuss nontrivial design decisions before building them.** If a fix could reasonably be done two different ways, or touches a widely-depended-on function, lay out the tradeoff and ask before writing code. Keep discussion replies short, plain language, no jargon unless asked for detail. When asked for a numbered list, give one.
2. **Never guess at behavior - trace the actual code and confirm against a live repro.** For anything nontrivial, prove a fix actually fixes the reported bug by reproducing the bug against a pre-fix baseline (a temporary `git worktree` + second `vite` port is the established way to do this without disturbing the main working tree) before claiming it's fixed.
3. **Full regression suite before every PR, no shortcuts** - the user has explicitly rejected a "lighter testing" approach. All Playwright regression tests live in `tests/` (see below) and must all still pass (or fail in an already-understood way, i.e. a `known-bug-*` file) before shipping.
4. **Dates in tests**: always relative (`businessDayStr(n)` in `tests/harness.mjs`), never hardcoded - a hardcoded date drifts into the past and the test silently stops working (a past-dated entry is non-editable).
5. **Verify what actually landed on `origin/main` after every merge** - never trust the merge API response alone. `git fetch origin main && git show origin/main:src/App.jsx | grep <marker>` after every squash-merge.
6. **Squash-merge history divergence**: a feature branch's own commits and `origin/main`'s squash-merged commits diverge in SHA even when content-identical. Before pushing, always `git fetch origin main` then `git merge origin/main` (not rebase) into the branch first if behind, resolving any `TESTING_NOTES.md` conflicts by keeping the branch's (HEAD's) content.
7. **Log vs. fix now**: for a newly-found issue that isn't what's currently being worked on, add a numbered entry to `TESTING_NOTES.md` with root cause + live-repro + fix direction, commit and push to the branch only (no PR), and move on - unless it's confirmed, severe, active data loss, in which case ask the user "fix now or log?" explicitly.
8. **Work the list in order** (don't skip ahead) unless there's a clearly better reason to reorder, and say so before deviating.

## Testing

- Dev server: `nohup npx vite --port 5183 > /tmp/viteN.log 2>&1 & disown` as its own isolated Bash call (combining it with other shell commands in one call has caused it to die silently before). Confirm with `curl -s -o /dev/null -w "%{http_code}" http://localhost:5183`.
- All Playwright regression tests live in the repo's `tests/` folder (see `tests/README.md`): `tests/run-all.sh` runs them all, `tests/baseline.sh <commit>` starts an older version on another port to prove a test fails before its fix. They never touch the real database (in-memory fake of `/api/db`) and use only relative dates. `known-bug-*.mjs` files are logged-but-unfixed bugs, expected to fail. (The older scratchpad-based suite was lost with an earlier session's container - that's why they now live in the repo.)
- **Never run git operations that touch `src/App.jsx`'s file content (stash, merge, checkout) while the regression suite is running in the background** - Vite's hot-reload will churn the live page mid-test and cause spurious, misleading timeouts across unrelated test files. A plain `git add`/`commit`/`push` with nothing to merge is safe since it never touches working-tree file content.
- Playwright conventions: mock `**/api/db*` per table+method; `sessionStorage.setItem('djc_user', ...)` via `addInitScript` for auth; `div[draggable="true"]` for entry blocks (note: a past-dated/non-editable entry renders `draggable={false}`); staff rows span two `<tr>` elements (name only in the first, rowSpan'd), so a Slot 2 row's cells are off-by-one vs the header row (no leading name `<td>`); locate the grid's "today" column via exact weekday-label text match against the header row, never a fixed column index.
