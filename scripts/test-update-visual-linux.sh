#!/usr/bin/env bash
# Regenerate (default) or check (--check) the linux pixel baselines of tests/e2e/visual.spec.js.
#
# Runs the desktop-visual-chromium project in the official Playwright image that matches the
# installed @playwright/test version, as linux/amd64: the same image and architecture as the
# `visual-nightly` CI job (.github/workflows/test.yml). Needs docker. Holds the shared test lock.
#
#   scripts/test-update-visual-linux.sh           # rewrite tests/e2e/visual.spec.js-snapshots/*-linux.png
#   scripts/test-update-visual-linux.sh --check   # compare only; failures land in test-results/visual-linux
#
# Regenerate only when the drawing or the shell changed on purpose, and say so in the commit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MODE=update
if [ "${1:-}" = "--check" ]; then MODE=check; shift; fi
PW_VERSION="$(node -p "require('@playwright/test/package.json').version")"
IMAGE="${VECTURA_PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PW_VERSION}-noble}"
SNAPSHOTS="tests/e2e/visual.spec.js-snapshots"
RESULTS="test-results/visual-linux"
mkdir -p "$SNAPSHOTS" "$RESULTS"
echo "[visual:linux] $MODE in $IMAGE (linux/amd64)"

exec node scripts/test-queue.js docker run --rm --platform linux/amd64 --ipc=host \
  -v "$ROOT:/src:ro" -v "$ROOT/$SNAPSHOTS:/snapshots" -v "$ROOT/$RESULTS:/results" \
  -e MODE="$MODE" "$IMAGE" bash -c '
    set -euo pipefail
    mkdir /work
    tar -C /src --exclude=./node_modules --exclude=./.git --exclude=./graphify-out --exclude=./test-results \
      --exclude=./playwright-report -cf - . | tar -C /work -xf -
    cd /work
    npm ci --no-audit --no-fund --loglevel=error
    args=(tests/e2e/visual.spec.js --project=desktop-visual-chromium --reporter=line --retries=0)
    if [ "$MODE" = update ]; then args+=(--update-snapshots=all); fi
    status=0
    ENABLE_SCREENSHOT_VISUALS=1 npx playwright test "${args[@]}" || status=$?
    if [ "$MODE" = update ]; then
      rm -f /snapshots/*-linux.png
      cp tests/e2e/visual.spec.js-snapshots/*-linux.png /snapshots/
    fi
    if [ -d test-results ]; then cp -R test-results/. /results/; fi
    exit "$status"
  '
