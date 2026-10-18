#!/usr/bin/env bash
# Build the release zip: scripts/release-build-zip.sh <version> [out-dir]
# Every listed path must exist. A missing path fails the build (judgment R-3).
set -euo pipefail
VERSION="${1:?usage: release-build-zip.sh <version> [out-dir]}"
OUT_DIR="${2:-.}"
FILES=(index.html src assets patterns README.md CHANGELOG.md)
missing=0
for f in "${FILES[@]}"; do
  if [ ! -e "$f" ]; then
    echo "::error::release zip: listed path '$f' does not exist" >&2
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 1
ZIP="$OUT_DIR/vectura-studio-${VERSION}.zip"
rm -f "$ZIP"
zip -qr "$ZIP" "${FILES[@]}"
echo "$ZIP"
