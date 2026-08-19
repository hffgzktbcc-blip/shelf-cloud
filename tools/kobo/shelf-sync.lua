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
  const unsigned char *sqlite3_column_text(sqlite3_stmt *, int);
  int sqlite3_column_int(sqlite3_stmt *, int);
  const char *sqlite3_errmsg(sqlite3 *);
]]

local SQLITE_OK = 0
local SQLITE_ROW = 100
local SQLITE_OPEN_READONLY = 0x00000001
local sqlite = ffi.load("/mnt/onboard/.adds/koreader/libs/libsqlite3.so.0")
local url = assert(os.getenv("SHELF_URL"), "SHELF_URL is not configured")
local token = assert(os.getenv("SHELF_TOKEN"), "SHELF_TOKEN is not configured")

-- One reachability check before syncing anything. A DHCP lease that has moved otherwise
-- produces a failure line per book without ever naming the cause.
do
  local probe = {}
  local ok, code = http.request {
    url = url,
    method = "GET",
    headers = { ["Authorization"] = "Bearer " .. token },
    sink = ltn12.sink.table(probe),
  }
  if not ok then
    error("cannot reach Shelf at " .. url ..
      " — check the Mac is awake, on the same Wi-Fi, and that the address in shelf-sync.conf is current")
  end
  if tonumber(code) == 401 then
    error("Shelf rejected the token — create a new one in Settings and update shelf-sync.conf")
  end
  if tonumber(code) ~= 200 then
    error("Shelf answered " .. tostring(code) .. " at " .. url)
  end
end

local db_ptr = ffi.new("sqlite3*[1]")
local rc = sqlite.sqlite3_open_v2("/mnt/onboard/.kobo/KoboReader.sqlite", db_ptr, SQLITE_OPEN_READONLY, nil)
if rc ~= SQLITE_OK then
  error("could not open Kobo database: " .. (db_ptr[0] ~= nil and ffi.string(sqlite.sqlite3_errmsg(db_ptr[0])) or tostring(rc)))
end
local db = db_ptr[0]
local stmt_ptr = ffi.new("sqlite3_stmt*[1]")
local query = [[select ContentID, coalesce(___PercentRead, 0)
  from content
  where DateLastRead is not null and IsDownloaded = 1
  order by DateLastRead desc limit 20]]
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
sqlite.sqlite3_close(db)

local sent = 0
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
  else
    io.stderr:write("Shelf sync failed for ", documents[i], " (", tostring(code), ")\n")
  end
end
if #documents == 0 then
  print("Shelf sync: nothing to send — no downloaded book has been opened yet")
else
  print("Shelf sync: sent " .. tostring(sent) .. " of " .. tostring(#documents))
  if sent == 0 then
    error("no position was accepted — see the lines above")
  end
end
