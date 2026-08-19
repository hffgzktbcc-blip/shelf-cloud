#!/bin/sh

# Shelf sync client for a stock Kobo.
#
# Install shelf-sync.sh, shelf-sync.lua and shelf-sync.conf under
# /mnt/onboard/.adds/shelf-sync/ and put the address and token in shelf-sync.conf —
# this script does not need editing.

ROOT="/mnt/onboard/.adds/shelf-sync"
CONF="$ROOT/shelf-sync.conf"
LOG="$ROOT/last-error.log"

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

{
  LUA_PATH="$LUA_PATH" LUA_CPATH="$LUA_CPATH" LD_LIBRARY_PATH="$LD_LIBRARY_PATH" \
  SHELF_TOKEN="$SHELF_TOKEN" SHELF_HOST="$SHELF_HOST" SHELF_PORT="$SHELF_PORT" \
  SHELF_ROOT="$ROOT" \
    "$LUA" "$ROOT/shelf-sync.lua"
} 2>"$LOG"
exit_code=$?

if [ "$exit_code" -ne 0 ]; then
  echo "Shelf sync failed. Details in last-error.log"
  cat "$LOG"
fi
exit "$exit_code"
