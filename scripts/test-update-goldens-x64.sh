#!/usr/bin/env bash
# Regenerate the x64 section of tests/baselines/golden-values/*.json.
#
# Runs the golden-value test files with VECTURA_UPDATE_BASELINES=1 in a linux/amd64 Node 20
# container, which rounds V8 Math exactly like GitHub's ubuntu x86_64 runner. Needs docker.
# Arguments narrow the run to the given test files. Holds the shared test lock while it runs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${VECTURA_X64_NODE_IMAGE:-node:20.20.2-bookworm-slim}"
cd "$ROOT"
if [ "$#" -gt 0 ]; then
  files="$*"
else
  files="$(node -e "process.stdout.write(require('./scripts/test-update-baselines').goldenValueFiles().join(' '))")"
fi
[ -n "$files" ] || { echo "no golden-value test files found" >&2; exit 1; }
echo "[goldens:x64] regenerating: $files"

exec node scripts/test-queue.js docker run --rm --platform linux/amd64 \
  -v "$ROOT:/src:ro" -v "$ROOT/tests/baselines/golden-values:/out" \
  -e FILES="$files" "$IMAGE" bash -c '
    set -euo pipefail
    mkdir /work
    tar -C /src --exclude=./node_modules --exclude=./.git --exclude=./graphify-out --exclude=./test-results -cf - . | tar -C /work -xf -
    cd /work
    npm ci --no-audit --no-fund --loglevel=error
    # shellcheck disable=SC2086
    VECTURA_UPDATE_BASELINES=1 node scripts/run-vitest.js run $FILES
    cp tests/baselines/golden-values/*.json /out/
  '
