# Regression tests

Browser tests (Playwright) for every bug fixed so far. They never touch the
real database: each test swaps `/api/db` for an in-memory fake, so it can
check exactly what got saved.

## Run them

1. Start the app: `npx vite --port 5183` (run it on its own, leave it running).
2. Run everything: `tests/run-all.sh`
3. Run one: `node tests/test-zero-hours-deletes.mjs`

Each file prints `PASS`/`FAIL` per check, then `ALL PASS` or `FAILED (n)`.
`run-all.sh` prints one line per file; full output goes to `/tmp/djc-test-logs/`.

## Prove a test really catches its bug

Every test should FAIL on the code from just before its fix, and PASS now.

1. `tests/baseline.sh <commit>~1 5184` starts that older version on port 5184.
2. `BASE=http://localhost:5184 node tests/test-xyz.mjs` should fail.
3. `tests/baseline.sh stop 5184` cleans up.

The commit for each test is named at the top of the test file.

## Writing a new test

- Use `harness.mjs`: `launch(seed)`, `cell()`, `block()`, `drag()`, `settle()`, `at()`, `snap()`.
- Use relative dates only (`businessDayStr(n)`), never fixed dates, so tests never go stale.
- Check the saved rows (`db.tables.entries`), not just the screen.
- Never run git commands that change `src/App.jsx` while tests are running.
  The app reloads mid-test and causes false failures.

## Known open bugs

`known-bug-*.mjs` files test bugs that are logged in `TESTING_NOTES.md` but
not fixed yet. They are expected to fail. `run-all.sh` reports them
separately and doesn't count them. Once the bug is fixed, the file should
pass: rename it to `test-...` so it counts from then on.
