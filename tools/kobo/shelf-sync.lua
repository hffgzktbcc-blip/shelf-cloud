local ffi = require("ffi")
local http = require("socket.http")
local ltn12 = require("ltn12")

ffi.cdef[[
  typedef struct sqlite3 sqlite3;
  typedef struct sqlite3_stmt sqlite3_stmt;
  int sqlite3_open_v2(const char *, sqlite3 **, int, const char *);
  int sqlite3_close(sqlite3 *);
  int sqlite3_prepare_v2(sqlite3 *, const char *, int, sqlite3_stmt **, const char **);
  int sqlite3_step(sqlite3_stmt *);
  int sqlite3_finalize(sqlite3_stmt *);
  int sqlite3_bind_double(sqlite3_stmt *, int, double);
  int sqlite3_bind_text(sqlite3_stmt *, int, const char *, int, void (*)(void *));
  const unsigned char *sqlite3_column_text(sqlite3_stmt *, int);
  int sqlite3_column_int(sqlite3_stmt *, int);
  const char *sqlite3_errmsg(sqlite3 *);
]]

local SQLITE_OK = 0
local SQLITE_ROW = 100
local SQLITE_DONE = 101
local SQLITE_OPEN_READONLY = 0x00000001
local SQLITE_OPEN_READWRITE = 0x00000002
local SQLITE_TRANSIENT = ffi.cast("void (*)(void *)", -1)
local sqlite = ffi.load("/mnt/onboard/.adds/koreader/libs/libsqlite3.so.0")
local token = assert(os.getenv("SHELF_TOKEN"), "SHELF_TOKEN is not configured")
local port = tonumber(os.getenv("SHELF_PORT") or "3000") or 3000
local hint = os.getenv("SHELF_HOST")
local cache_path = (os.getenv("SHELF_ROOT") or "/mnt/onboard/.adds/shelf-sync") .. "/last-host"

local socket = require("socket")

local function endpoint(host)
  return "http://" .. host .. ":" .. tostring(port) .. "/api/kobo/sync"
end

--- Does Shelf answer here, and does it accept our token?
local function answers(host, timeout)
  local probe = {}
  local ok, code = http.request {
    url = endpoint(host),
    method = "GET",
    headers = { ["Authorization"] = "Bearer " .. token },
    sink = ltn12.sink.table(probe),
    create = function()
      local sock = socket.tcp()
      sock:settimeout(timeout or 0.4)
      return sock
    end,
  }
  if not ok then return false end
  if tonumber(code) == 401 then
    error("Shelf rejected the token — create a new one in Settings and put it in shelf-sync.conf")
  end
  return tonumber(code) == 200
end

--- The Kobo's own address, found by asking the OS which interface would route outward.
--- No packet is sent; a UDP "connection" only fixes the local end.
local function own_ip()
  local probe = socket.udp()
  if not probe then return nil end
  probe:setpeername("8.8.8.8", 53)
  local ip = probe:getsockname()
  probe:close()
  return ip
end

local function read_cache()
  local f = io.open(cache_path, "r")
  if not f then return nil end
  local host = f:read("*l")
  f:close()
  if host and host:match("^%d+%.%d+%.%d+%.%d+$") then return host end
  return nil
end

local function write_cache(host)
  local f = io.open(cache_path, "w")
  if f then
    f:write(host, "\n")
    f:close()
  end
end

--- Find Shelf without being told where it is.
---
--- A home network hands out addresses by DHCP, so any address written down goes stale.
--- Try what worked last time, then what the config suggests, then walk the subnet this
--- Kobo is already on. Whatever answers is remembered for next time.
local function discover()
  -- Built by appending rather than as a literal: ipairs stops at the first nil, so
  -- {read_cache(), hint} silently skips the hint whenever there is no cache yet — which
  -- is exactly the first run, when the hint is the only thing you have.
  local known = {}
  local cached = read_cache()
  if cached and cached ~= "" then known[#known + 1] = cached end
  if hint and hint ~= "" and hint ~= cached then known[#known + 1] = hint end

  for _, host in ipairs(known) do
    io.write("Shelf sync: trying ", host, "\n")
    if answers(host, 2) then
      write_cache(host)
      return host
    end
  end

  local ip = own_ip()
  if not ip then
    error("could not work out this Kobo's own address — set SHELF_HOST in shelf-sync.conf")
  end
  local prefix = ip:match("^(%d+%.%d+%.%d+%.)")
  if not prefix then
    error("unexpected address " .. tostring(ip) .. " — set SHELF_HOST in shelf-sync.conf")
  end

  -- NickelMenu kills the script at about nine and a half seconds, so the sweep gets a
  -- budget rather than however long eight batches happen to take.
  local sweep_until = socket.gettime() + 6.5
  io.write("Shelf sync: looking for Shelf on ", prefix, "0/24\n")

  -- Sweeping the subnet one address at a time means waiting out a timeout for every
  -- silent host — half a minute or worse on this hardware. Instead, open a batch of
  -- non-blocking connections at once and ask select() which of them came up.
  local BATCH = 32
  local last = 1
  while last <= 254 and socket.gettime() < sweep_until do
    local pending, socks = {}, {}
    local upto = math.min(last + BATCH - 1, 254)

    for n = last, upto do
      local candidate = prefix .. tostring(n)
      if candidate ~= ip then
        local sock = socket.tcp()
        if sock then
          sock:settimeout(0)
          sock:connect(candidate, port)
          pending[sock] = candidate
          socks[#socks + 1] = sock
        end
      end
    end

    -- Keep looking at this batch until the deadline rather than taking one snapshot:
    -- a handshake that needed an ARP round trip lands late, not never.
    local deadline = socket.gettime() + 1.0
    while #socks > 0 and socket.gettime() < deadline do
      local _, writable = socket.select(nil, socks, 0.4)
      local ready = writable or {}
      if #ready == 0 then
        -- nothing yet; loop until the deadline
      else
        for _, sock in ipairs(ready) do
          local candidate = pending[sock]
          -- Writable alone isn't enough: a refused connection wakes select too. A peer
          -- name means the handshake actually completed.
          if candidate and sock:getpeername() then
            for s2 in pairs(pending) do s2:close() end
            if answers(candidate, 2) then
              write_cache(candidate)
              io.write("Shelf sync: found Shelf at ", candidate, "\n")
              return candidate
            end
            pending, socks = {}, {}
            break
          end
          pending[sock] = nil
        end
        local remaining = {}
        for _, sock in ipairs(socks) do
          if pending[sock] then remaining[#remaining + 1] = sock end
        end
        socks = remaining
      end
    end

    for sock in pairs(pending) do sock:close() end
    last = upto + 1
  end

  error("no Shelf found on " .. prefix .. "0/24 — check the Mac is awake, on this Wi-Fi, " ..
    "and that the app is running; or set SHELF_HOST in shelf-sync.conf")
end

local host = discover()
local url = endpoint(host)
write_cache(host)

local db_ptr = ffi.new("sqlite3*[1]")
local rc = sqlite.sqlite3_open_v2("/mnt/onboard/.kobo/KoboReader.sqlite", db_ptr, SQLITE_OPEN_READWRITE, nil)
if rc ~= SQLITE_OK then
  error("could not open Kobo database: " .. (db_ptr[0] ~= nil and ffi.string(sqlite.sqlite3_errmsg(db_ptr[0])) or tostring(rc)))
end
local db = db_ptr[0]
local stmt_ptr = ffi.new("sqlite3_stmt*[1]")
-- ContentType 6 is a book; 9 and 899 are chapters and other sub-entries, which have their
-- own progress and would drown the real titles.
--
-- IsDownloaded is not a boolean in this database: the firmware writes the integer 1 for
-- some rows and the strings 'true'/'false' for others. Every row that has actually been
-- read carries a string, so comparing against 1 matched nothing at all and the sync sent
-- nothing, silently, every time.
local query = [[select ContentID, coalesce(___PercentRead, 0)
  from content
  where ContentType = 6
    and IsDownloaded in ('true', '1', 1)
  order by DateLastRead desc, Title asc limit 100]]
rc = sqlite.sqlite3_prepare_v2(db, query, -1, stmt_ptr, nil)
if rc ~= SQLITE_OK then
  local message = ffi.string(sqlite.sqlite3_errmsg(db))
  sqlite.sqlite3_close(db)
  error("could not query Kobo database: " .. message)
end

local function json_string(value)
  value = tostring(value or "")
  return '"' .. value:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t') .. '"'
end

local documents = {}
local percentages = {}
while sqlite.sqlite3_step(stmt_ptr[0]) == SQLITE_ROW do
  documents[#documents + 1] = ffi.string(sqlite.sqlite3_column_text(stmt_ptr[0], 0))
  percentages[#percentages + 1] = sqlite.sqlite3_column_int(stmt_ptr[0], 1)
end
sqlite.sqlite3_finalize(stmt_ptr[0])

local sent = 0
local pulled = 0
for i = 1, #documents do
  local body = '{"document":' .. json_string(documents[i]) ..
    ',"percentage":' .. string.format("%.6f", percentages[i] / 100) ..
    ',"device":"Kobo Clara Colour"}'
  local response = {}
  local ok, code = http.request {
    url = url,
    method = "POST",
    headers = {
      ["Authorization"] = "Bearer " .. token,
      ["Content-Type"] = "application/json",
      ["Content-Length"] = tostring(#body),
    },
    source = ltn12.source.string(body),
    sink = ltn12.sink.table(response),
  }
  if ok and tonumber(code) == 200 then
    sent = sent + 1
    local response_body = table.concat(response)
    local shelf_percentage = response_body:match('"shelfPercentage"%s*:%s*([0-9%.]+)')
    if shelf_percentage then
      local update_ptr = ffi.new("sqlite3_stmt*[1]")
      local update_sql = "update content set ___PercentRead = ? where ContentID = ?"
      local update_rc = sqlite.sqlite3_prepare_v2(db, update_sql, -1, update_ptr, nil)
      if update_rc == SQLITE_OK then
        sqlite.sqlite3_bind_double(update_ptr[0], 1, tonumber(shelf_percentage) * 100)
        sqlite.sqlite3_bind_text(update_ptr[0], 2, documents[i], -1, SQLITE_TRANSIENT)
        if sqlite.sqlite3_step(update_ptr[0]) == SQLITE_DONE then pulled = pulled + 1 end
        sqlite.sqlite3_finalize(update_ptr[0])
      end
    end

    -- ___PercentRead is only the cosmetic figure on the library tile; the reader itself
    -- navigates to ChapterIDBookmarked and overwrites the percentage from there on open.
    -- Without also moving this, opening the book snaps back to wherever you last actually
    -- read on the device.
    local chapter_href = response_body:match('"chapterHref"%s*:%s*"(.-)"')
    if chapter_href and chapter_href ~= "" then
      local bookmark_ptr = ffi.new("sqlite3_stmt*[1]")
      local bookmark_sql = "update content set ChapterIDBookmarked = ? where ContentID = ?"
      local bookmark_rc = sqlite.sqlite3_prepare_v2(db, bookmark_sql, -1, bookmark_ptr, nil)
      if bookmark_rc == SQLITE_OK then
        sqlite.sqlite3_bind_text(bookmark_ptr[0], 1, chapter_href, -1, SQLITE_TRANSIENT)
        sqlite.sqlite3_bind_text(bookmark_ptr[0], 2, documents[i], -1, SQLITE_TRANSIENT)
        sqlite.sqlite3_step(bookmark_ptr[0])
        sqlite.sqlite3_finalize(bookmark_ptr[0])
      end
    end
  else
    io.stderr:write("Shelf sync failed for ", documents[i], " (", tostring(code), ")\n")
  end
end
if #documents == 0 then
  print("Shelf sync: nothing to send — no downloaded book has been opened yet")
else
  print("Shelf sync: sent " .. tostring(sent) .. " of " .. tostring(#documents) .. ", pulled " .. tostring(pulled) .. " back")
  if sent == 0 then
    error("no position was accepted — see the lines above")
  end
end
sqlite.sqlite3_close(db)
