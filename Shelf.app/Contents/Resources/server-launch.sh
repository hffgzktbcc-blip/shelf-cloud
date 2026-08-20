#!/bin/bash
# Starts the Next.js dev server directly (no npm wrapper) so the app can
# reliably terminate the exact process when the window closes.
set -e

ROOT="$1"
PORT="$2"

cd "$ROOT"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  . "$HOME/.nvm/nvm.sh"
fi

exec node_modules/.bin/next dev --hostname 0.0.0.0 --port "$PORT"
