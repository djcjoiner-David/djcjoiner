#!/usr/bin/env bash
# Runs every test-*.mjs in this folder against the app at $BASE (default
# http://localhost:5183 - start it first with: npx vite --port 5183).
# Prints one line per test file and a total; exits non-zero if any failed.
# Full output for each file goes to $LOGDIR (default /tmp/djc-test-logs).
cd "$(dirname "$0")"
LOGDIR="${LOGDIR:-/tmp/djc-test-logs}"; mkdir -p "$LOGDIR"
pass=0; fail=0; failed=()
for f in ${@:-test-*.mjs}; do
  if timeout 300 node "$f" > "$LOGDIR/${f%.mjs}.log" 2>&1; then
    echo "PASS  $f"; pass=$((pass+1))
  else
    echo "FAIL  $f   (see $LOGDIR/${f%.mjs}.log)"; fail=$((fail+1)); failed+=("$f")
  fi
done
echo "----"; echo "$pass passed, $fail failed"
# known-bug-*.mjs: tests for bugs that are logged but NOT fixed yet. They're
# expected to fail; reported separately so they never hide a real regression.
if [ $# -eq 0 ]; then
  for f in known-bug-*.mjs; do
    [ -e "$f" ] || continue
    if timeout 300 node "$f" > "$LOGDIR/${f%.mjs}.log" 2>&1; then
      echo "NOW PASSES (bug fixed? update TESTING_NOTES and rename to test-): $f"
    else
      echo "known bug, still failing as expected: $f"
    fi
  done
fi
[ $fail -eq 0 ]
