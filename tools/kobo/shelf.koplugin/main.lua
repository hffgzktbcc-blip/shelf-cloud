local DataStorage = require("datastorage")
local Event = require("ui/event")
local InfoMessage = require("ui/widget/infomessage")
local LuaSettings = require("luasettings")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local logger = require("logger")
local util = require("util")
local http = require("socket.http")
local ltn12 = require("ltn12")
local _ = require("gettext")

-- Reuses the same config file as the stock-Kobo shelf-sync tool, so the token/host only
-- need to be set up once.
local CONF_PATH = "/mnt/onboard/.adds/shelf-sync/shelf-sync.conf"

local Shelf = WidgetContainer:extend{
    name = "shelf",
    is_doc_only = true,
    settings_file = DataStorage:getSettingsDir() .. "/shelf.lua",
}

Shelf.default_settings = {
    auto_sync = false,
}

local function readConf()
    local conf = {}
    local f = io.open(CONF_PATH, "r")
    if not f then return conf end
    for line in f:lines() do
        local key, val = line:match('^%s*([%u_]+)%s*=%s*"(.-)"%s*$')
        if key then conf[key] = val end
    end
    f:close()
    return conf
end

local function jsonString(v)
    v = tostring(v or "")
    return '"' .. v:gsub("\\", "\\\\"):gsub('"', '\\"') .. '"'
end

function Shelf:loadSettings()
    if not Shelf.settings_obj then
        Shelf.settings_obj = LuaSettings:open(self.settings_file)
    end
    self.settings = Shelf.settings_obj:readSetting("settings", Shelf.default_settings)
end

function Shelf:onFlushSettings()
    if self.updated then
        Shelf.settings_obj:flush()
        self.updated = nil
    end
end

function Shelf:init()
    self:loadSettings()
    self.ui.menu:registerToMainMenu(self)
end

function Shelf:onReaderReady()
    if self.settings.auto_sync then
        UIManager:nextTick(function() self:sync(false) end)
    end
end

function Shelf:getFileName()
    local file = self.ui.document.file
    if not file then return nil end
    local _unused, file_name = util.splitFilePathName(file) -- luacheck: no unused
    return file_name
end

-- Fraction 0..1, matching both Shelf's own percentage scale and KOReader's internal one.
function Shelf:getCurrentPercent()
    if self.ui.document.info.has_pages then
        return self.ui.paging:getLastPercent()
    else
        return self.ui.rolling:getLastPercent()
    end
end

-- GotoPercent expects 0..100 for reflowable text; paged docs navigate by page number
-- instead — same split ReaderRolling/ReaderPaging use internally.
function Shelf:applyPercent(percent)
    if self.ui.document.info.has_pages then
        local page = math.floor(percent * self.ui.document:getPageCount() + 0.5)
        self.ui:handleEvent(Event:new("GotoPage", page))
    else
        self.ui:handleEvent(Event:new("GotoPercent", percent * 100))
    end
end

-- Shared with the stock-Kobo shelf-sync tool, so whichever one finds Shelf first saves the
-- other a failed attempt when the Mac's DHCP lease moves.
local LAST_HOST_PATH = "/mnt/onboard/.adds/shelf-sync/last-host"

local function readLastHost()
    local f = io.open(LAST_HOST_PATH, "r")
    if not f then return nil end
    local host = f:read("*l")
    f:close()
    if host and host:match("^%d+%.%d+%.%d+%.%d+$") then return host end
    return nil
end

local function writeLastHost(host)
    local f = io.open(LAST_HOST_PATH, "w")
    if f then
        f:write(host, "\n")
        f:close()
    end
end

local function post(host, port, token, body)
    local response = {}
    local ok, code = http.request{
        url = "http://" .. host .. ":" .. port .. "/api/kobo/sync",
        method = "POST",
        headers = {
            ["Authorization"] = "Bearer " .. token,
            ["Content-Type"] = "application/json",
            ["Content-Length"] = tostring(#body),
        },
        source = ltn12.source.string(body),
        sink = ltn12.sink.table(response),
        create = function()
            local sock = require("socket").tcp()
            sock:settimeout(2)
            return sock
        end,
    }
    if ok and tonumber(code) == 200 then return true, table.concat(response) end
    return false, nil
end

function Shelf:sync(interactive)
    local conf = readConf()
    local token = conf.SHELF_TOKEN
    local port = conf.SHELF_PORT or "3000"

    if not token or token == "" or token == "PASTE_TOKEN_FROM_SHELF_SETTINGS" then
        if interactive then
            UIManager:show(InfoMessage:new{ text = _("Set SHELF_TOKEN in shelf-sync.conf first."), timeout = 3 })
        end
        return
    end

    -- The Mac's LAN address moves with its DHCP lease, so the configured hint can go
    -- stale. Try the cached address (kept fresh by either tool) before the hint itself.
    local candidates = {}
    local cached = readLastHost()
    if cached then candidates[#candidates + 1] = cached end
    if conf.SHELF_HOST and conf.SHELF_HOST ~= "" and conf.SHELF_HOST ~= cached then
        candidates[#candidates + 1] = conf.SHELF_HOST
    end
    if #candidates == 0 then
        if interactive then
            UIManager:show(InfoMessage:new{ text = _("Set SHELF_HOST in shelf-sync.conf first."), timeout = 3 })
        end
        return
    end

    local file_name = self:getFileName()
    if not file_name then return end
    local percent = self:getCurrentPercent()

    local body = "{"
        .. '"document":' .. jsonString("file://" .. file_name) .. ","
        .. '"percentage":' .. string.format("%.6f", percent) .. ","
        .. '"device":"KOReader"'
        .. "}"

    local response_body
    for _idx, host in ipairs(candidates) do
        local ok, resp = post(host, port, token, body)
        if ok then
            writeLastHost(host)
            response_body = resp
            break
        end
    end

    if not response_body then
        logger.warn("Shelf: sync failed, tried", table.concat(candidates, ", "))
        if interactive then
            UIManager:show(InfoMessage:new{
                text = _("Shelf sync failed — check the Mac is awake and on this Wi-Fi, or update SHELF_HOST in shelf-sync.conf."),
                timeout = 4,
            })
        end
        return
    end

    local shelf_percentage = tonumber(response_body:match('"shelfPercentage"%s*:%s*([0-9%.]+)'))
    if not shelf_percentage then
        if interactive then
            UIManager:show(InfoMessage:new{
                text = _("Synced, but Shelf has no aligned position for this book yet."),
                timeout = 3,
            })
        end
        return
    end

    -- Shelf already returns max(shelf, ours), so strictly-greater means real new progress.
    if shelf_percentage > percent + 0.001 then
        self:applyPercent(shelf_percentage)
        if interactive then
            UIManager:show(InfoMessage:new{
                text = _("Synced to ") .. tostring(math.floor(shelf_percentage * 100)) .. "%",
                timeout = 3,
            })
        end
    elseif interactive then
        UIManager:show(InfoMessage:new{ text = _("Already up to date."), timeout = 3 })
    end
end

function Shelf:addToMainMenu(menu_items)
    menu_items.shelf_sync = {
        text = _("Shelf"),
        sub_item_table = {
            {
                text = _("Sync now"),
                callback = function() self:sync(true) end,
            },
            {
                text = _("Auto-sync on open"),
                checked_func = function() return self.settings.auto_sync end,
                callback = function()
                    self.settings.auto_sync = not self.settings.auto_sync
                    self.updated = true
                end,
            },
        },
    }
end

return Shelf
