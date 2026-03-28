#!/bin/bash
# Build tycono-server package for npm publish
# Copies only server files (no TUI) into a clean directory

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

echo "Building tycono-server package..."

# Clean
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/bin" "$DIST_DIR/src/api" "$DIST_DIR/src/shared" "$DIST_DIR/src/core" "$DIST_DIR/templates"

# Copy server source
cp -r "$ROOT_DIR/src/api/src" "$DIST_DIR/src/api/src"
cp "$ROOT_DIR/src/api/package.json" "$DIST_DIR/src/api/package.json" 2>/dev/null || true
cp "$ROOT_DIR/src/shared/types.ts" "$DIST_DIR/src/shared/types.ts"
cp "$ROOT_DIR/src/core/scaffolder.ts" "$DIST_DIR/src/core/scaffolder.ts"
# templates/ must be at dist root level — claude-md-manager resolves ../../../../templates from src/api/src/services/
cp -r "$ROOT_DIR/templates/"* "$DIST_DIR/templates/"

# Bundle default presets (free official presets shipped with server)
mkdir -p "$DIST_DIR/presets"
for preset in gamedev startup-mvp solo-founder; do
  if [ -d "$ROOT_DIR/../tycono-akb/knowledge/presets/$preset" ]; then
    cp -r "$ROOT_DIR/../tycono-akb/knowledge/presets/$preset" "$DIST_DIR/presets/$preset"
  fi
done

# Copy bin
cp "$SCRIPT_DIR/bin/cli.js" "$DIST_DIR/bin/cli.js"
cp "$SCRIPT_DIR/bin/server.ts" "$DIST_DIR/bin/server.ts"

# Copy package.json (fix import paths)
cp "$SCRIPT_DIR/package.json" "$DIST_DIR/package.json"

# Fix import path in server.ts (../../src → ../src)
sed -i '' 's|../../src/|../src/|g' "$DIST_DIR/bin/server.ts"
# Fix import path in cli.js (tycono.ts → server.ts already correct)

echo "Package built at $DIST_DIR"
echo ""
echo "To publish:"
echo "  cd $DIST_DIR && npm publish --tag beta"
