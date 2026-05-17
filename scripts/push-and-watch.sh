#!/bin/sh
# push-and-watch.sh — drop-in replacement for `git push` that also attaches to
# the GitHub Actions run kicked off by the push, so CI failures surface in
# near-real-time instead of minutes after the terminal returns.
#
# Usage: sh scripts/push-and-watch.sh [git push args...]
#
# Exits non-zero if either the push fails OR the watched CI run fails.

set -u

PREFIX="[push-and-watch]"

log() {
  printf '%s %s\n' "$PREFIX" "$*"
}

# --- Detect flags that mean "no CI will fire, so skip the watch step" --------
SKIP_WATCH=0
SKIP_REASON=""
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      SKIP_WATCH=1
      SKIP_REASON="--dry-run push"
      ;;
    --delete|-d)
      # Note: -d is also git push's short form for --delete.
      SKIP_WATCH=1
      SKIP_REASON="branch deletion"
      ;;
  esac
done

# --- Run the push ------------------------------------------------------------
log "running: git push $*"
git push "$@"
PUSH_STATUS=$?

if [ "$PUSH_STATUS" -ne 0 ]; then
  log "git push failed (exit $PUSH_STATUS); not watching CI."
  exit "$PUSH_STATUS"
fi

if [ "$SKIP_WATCH" -eq 1 ]; then
  log "skipping CI watch ($SKIP_REASON)."
  exit 0
fi

# --- Make sure gh is available and authenticated -----------------------------
if ! command -v gh >/dev/null 2>&1; then
  log "gh CLI not found; skipping CI watch."
  log "install it from https://cli.github.com/ to enable CI auto-watch."
  exit 0
fi

if ! gh auth status >/dev/null 2>&1; then
  log "gh CLI not authenticated; skipping CI watch."
  log "run 'gh auth login' to enable CI auto-watch."
  exit 0
fi

# --- Give GitHub a moment to register the new workflow run -------------------
log "push succeeded; waiting 5s for GitHub to register the workflow run..."
sleep 5

# --- Watch the most recent run -----------------------------------------------
# `gh run watch` (no run id) picks the most recent in-progress run for the
# current repo. If a previous run is still going, it may attach to that one
# instead of the freshly-pushed one — acceptable for v1; we can pin to a
# specific run id later if it bites.
log "attaching to latest GitHub Actions run via 'gh run watch --exit-status'..."
gh run watch --exit-status
WATCH_STATUS=$?

if [ "$WATCH_STATUS" -ne 0 ]; then
  log "CI run failed (gh run watch exit $WATCH_STATUS)."
  exit "$WATCH_STATUS"
fi

log "CI run succeeded."
exit 0
