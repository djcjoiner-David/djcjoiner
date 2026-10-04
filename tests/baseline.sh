#!/usr/bin/env bash
# Starts an older version of the app (any commit/branch) on its own port, so
# a test can be run against "before the fix" to prove it really catches the
# bug - without touching the main working copy.
#   ./baseline.sh <commit> [port]     e.g. ./baseline.sh 6dde7e1~1 5184
# Then:  BASE=http://localhost:5184 node test-xyz.mjs
# Stop:  ./baseline.sh stop [port]
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${2:-5184}"
DIR="${BASELINE_DIR:-/tmp/djc-baseline}-$PORT"
if [ "$1" = "stop" ]; then
  pkill -f "vit[e] --port $PORT" || true
  git -C "$REPO" worktree remove --force "$DIR" 2>/dev/null || true
  exit 0
fi
pkill -f "vit[e] --port $PORT" || true
git -C "$REPO" worktree remove --force "$DIR" 2>/dev/null || true
git -C "$REPO" worktree add --detach "$DIR" "$1" >/dev/null
ln -s "$REPO/node_modules" "$DIR/node_modules"
(cd "$DIR" && nohup npx vite --port "$PORT" --strictPort > "/tmp/vite-$PORT.log" 2>&1 &)
for i in $(seq 1 40); do
  if curl -s -o /dev/null "http://localhost:$PORT"; then echo "baseline $1 up on http://localhost:$PORT"; exit 0; fi
  sleep 0.5
done
echo "baseline failed to start - see /tmp/vite-$PORT.log"; exit 1
