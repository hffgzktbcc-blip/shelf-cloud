#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  . "$HOME/.nvm/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org/"
  read -r -p "Press Enter to close..."
  exit 1
fi

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

if ! curl -fsS "$URL" >/dev/null 2>&1; then
  npm run dev -- --hostname 0.0.0.0 --port "$PORT" &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

  for _ in {1..30}; do
    if curl -fsS "$URL" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

open "$URL"
if [[ -n "$LAN_IP" ]]; then
  echo "Phone/Kobo URL: http://${LAN_IP}:${PORT}"
fi
wait
