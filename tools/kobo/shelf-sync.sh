#!/bin/sh

# Shelf sync client for a stock Kobo.
#
# Install shelf-sync.sh, shelf-sync.lua and shelf-sync.conf under
# /mnt/onboard/.adds/shelf-sync/ and put the address and token in shelf-sync.conf —
# this script does not need editing.

ROOT="/mnt/onboard/.adds/shelf-sync"
CONF="$ROOT/shelf-sync.conf"
LOG="$ROOT/last-error.log"
LOCK="$ROOT/.sync.lock"
PIDFILE="$ROOT/.sync.pid"

# LuaJIT, SQLite and LuaSocket come from the KOReader install. Nothing here starts
# KOReader, but the tree has to be present.
KO="/mnt/onboard/.adds/koreader"
LUA="$KO/luajit"
LUA_PATH="$KO/?.lua;$KO/common/?.lua;$KO/common/?/init.lua;;"
LUA_CPATH="$KO/common/?.so;$KO/common/?/?.so;;"
LD_LIBRARY_PATH="$KO/libs"

if [ ! -r "$CONF" ]; then
  echo "Shelf sync: shelf-sync.conf is missing from $ROOT"
  exit 1
fi
. "$CONF"

if [ -z "$SHELF_TOKEN" ] || [ "$SHELF_TOKEN" = "PASTE_TOKEN_FROM_SHELF_SETTINGS" ]; then
  echo "Shelf sync: put your token in shelf-sync.conf (Shelf > Settings creates one)"
  exit 1
fi

if [ ! -x "$LUA" ]; then
  echo "Shelf sync: LuaJIT not found at $LUA — the KOReader tree provides it"
  exit 1
fi

if [ ! -r "$ROOT/shelf-sync.lua" ]; then
  echo "Shelf sync: shelf-sync.lua is missing from $ROOT"
  exit 1
fi

if [ "${1:-}" = "stop" ]; then
  if [ -r "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "Shelf sync: automatic sync stopped"
  else
    echo "Shelf sync: automatic sync is not running"
  fi
  exit 0
fi

# A single immediate pass, for "sync now" — doesn't touch the background loop or its lock.
if [ "${1:-}" = "once" ]; then
  LUA_PATH="$LUA_PATH" LUA_CPATH="$LUA_CPATH" LD_LIBRARY_PATH="$LD_LIBRARY_PATH" \
  SHELF_TOKEN="$SHELF_TOKEN" SHELF_HOST="$SHELF_HOST" SHELF_PORT="$SHELF_PORT" \
  SHELF_ROOT="$ROOT" \
    "$LUA" "$ROOT/shelf-sync.lua" 2>&1
  exit $?
fi

if ! mkdir "$LOCK" 2>/dev/null; then
  # A lock can outlive its process — a sleeping/disconnected device doesn't run the
  # trap that would normally clean this up. Only refuse to start if that pid is real.
  old_pid="$(cat "$PIDFILE" 2>/dev/null)"
  if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
    echo "Shelf sync: automatic sync is already running"
    exit 0
  fi
  rm -rf "$LOCK"
  if ! mkdir "$LOCK" 2>/dev/null; then
    echo "Shelf sync: automatic sync is already running"
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT INT TERM
echo "$$" >"$PIDFILE"
trap 'rm -f "$PIDFILE"; rmdir "$LOCK" 2>/dev/null' EXIT INT TERM

INTERVAL="${SHELF_INTERVAL:-60}"
case "$INTERVAL" in
  ''|*[!0-9]*) INTERVAL=60 ;;
esac

echo "Shelf sync: automatic sync started (every ${INTERVAL}s)"
while :; do
  {
    LUA_PATH="$LUA_PATH" LUA_CPATH="$LUA_CPATH" LD_LIBRARY_PATH="$LD_LIBRARY_PATH" \
    SHELF_TOKEN="$SHELF_TOKEN" SHELF_HOST="$SHELF_HOST" SHELF_PORT="$SHELF_PORT" \
    SHELF_ROOT="$ROOT" \
      "$LUA" "$ROOT/shelf-sync.lua"
  } >>"$LOG" 2>&1
  sleep "$INTERVAL"
done
