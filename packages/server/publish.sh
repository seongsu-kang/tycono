#!/bin/bash
# Publish tycono-server package to npm
# Source is now directly in packages/server/ — no copy needed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Publishing tycono-server from $SCRIPT_DIR"
echo ""

# Bundle default presets (free official presets shipped with server)
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
mkdir -p "$SCRIPT_DIR/presets"
for preset in gamedev startup-mvp solo-founder; do
  PRESET_SRC="$ROOT_DIR/../tycono-akb/knowledge/presets/$preset"
  if [ -d "$PRESET_SRC" ]; then
    cp -r "$PRESET_SRC" "$SCRIPT_DIR/presets/$preset"
    echo "  Bundled preset: $preset"
  fi
done

echo ""
echo "To publish:"
echo "  cd $SCRIPT_DIR && npm publish --tag beta"
echo ""
echo "To publish stable:"
echo "  cd $SCRIPT_DIR && npm publish"
