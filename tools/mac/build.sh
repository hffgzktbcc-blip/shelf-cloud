#!/bin/bash
# Compiles the Shelf.app native window wrapper and stages it next to the project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/Shelf.app"
MACOS_DIR="$APP/Contents/MacOS"
RES_DIR="$APP/Contents/Resources"

mkdir -p "$MACOS_DIR" "$RES_DIR"

swiftc "$ROOT/tools/mac/ShelfApp/main.swift" \
  -o "$MACOS_DIR/Shelf" \
  -framework Cocoa -framework WebKit

cp "$ROOT/tools/mac/server-launch.sh" "$RES_DIR/server-launch.sh"
chmod +x "$MACOS_DIR/Shelf" "$RES_DIR/server-launch.sh"

ICONSET="$ROOT/tools/mac/Shelf.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
swift "$ROOT/tools/mac/generate-icon.swift" "$ICONSET"
iconutil -c icns "$ICONSET" -o "$RES_DIR/Shelf.icns"
rm -rf "$ICONSET"

echo "Built $APP"
