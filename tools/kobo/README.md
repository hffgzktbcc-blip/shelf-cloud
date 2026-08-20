# Shelf sync for a stock Kobo

Syncs reading positions between the **stock Kobo reader** and Shelf over Wi-Fi. Nothing here
launches KOReader, and you carry on reading in Kobo's own reader as normal.

It does, however, **need the KOReader tree to be installed**, because that is where the Kobo
gets a LuaJIT binary, a SQLite library and LuaSocket from. Stock firmware ships none of
those. If you ever remove KOReader, this stops working. NickelMenu is used only as a way to
start the script from a menu.

Verified against a Clara Colour on firmware `4.45.23697`.

## What it reads

Stock-reader progress lives in `.kobo/KoboReader.sqlite`, in the `content` table:

- `ContentID` — the document identifier; for a sideloaded book this is a `file://` path
- `___PercentRead` — how far through, 0–100
- `DateLastRead` — when it was last opened
- `ContentType` — 6 is a book; 9 and 899 are chapters and other sub-entries

The script takes downloaded book entries from the stock Kobo and posts each position. Shelf
replies with its current position when that book is linked and aligned, and the script writes
that position back into the Kobo database. This means Shelf can push progress to a book before
you have opened it on the Kobo, while a newer position on either side can be carried across on
the next sync.

Two things about this table are worth knowing, because both were found the hard way on a
Clara Colour. `ContentType` must be filtered or chapter rows swamp the real titles. And
`IsDownloaded` is not a boolean: the firmware writes the integer `1` on some rows and the
strings `'true'`/`'false'` on others, and every row that has actually been read carries a
string — so comparing it against `1` matches nothing and the sync silently sends nothing.

Shelf matches a book by the MD5 of the filename, so a sideloaded EPUB matches the copy you
loaded into Shelf even though the Kobo renamed it to `.kepub.epub`. Books bought from the
Kobo store have no filename to match on and will arrive unmatched — you can link those to a
book by hand on its page in Shelf.

## Install

1. In Shelf, open **Settings** and create a Kobo sync token.
2. Copy `shelf-sync.sh`, `shelf-sync.lua` and `shelf-sync.conf` to the Kobo at
   `.adds/shelf-sync/`.
3. Put the token in **`shelf-sync.conf`**. That is the only required setting — the scripts
   themselves never need editing.
4. Copy `nickelmenu-shelf-sync.conf` to `.adds/nm/`.
5. Eject the Kobo cleanly and let NickelMenu reload.
6. With the Kobo on the same Wi-Fi as the Mac, open **Start Shelf automatic sync** in
   NickelMenu. The helper keeps running and syncs every minute while the Kobo is awake.
   Opening the menu again is harmless if it is already running.

The helper currently needs to be started again after a Kobo reboot. NickelMenu does not
provide a supported boot or wake trigger. Once started, it syncs repeatedly while you read
on Kobo or listen in Shelf; the next poll carries the newer position in either direction.

## Finding Shelf

You don't give it an address. A home network hands out addresses by DHCP, so anything
written down goes stale — which is exactly what happened to the first version of this.

Instead the script tries, in order: the address that worked last time, the optional
`SHELF_HOST` hint if you set one, and then a sweep of whatever network the Kobo is already
on. The sweep opens connections in batches rather than one at a time, so it takes about a
second rather than half a minute. Whatever answers is remembered for next time, so a lease
that moves fixes itself on the next sync.

Setting `SHELF_HOST` is optional and only skips the first sweep.

## Automatic sync behavior

The interval defaults to 60 seconds and can be changed with `SHELF_INTERVAL` in
`shelf-sync.conf`. Only one helper instance is allowed at a time. Each poll reads the stock
reader's downloaded book entries, sends them to Shelf, and writes Shelf's merged percentage
back to the Kobo database. The existing monotonic rule means an older position cannot move
either side backward.

Use **Stop Shelf automatic sync** in NickelMenu when you want to stop the background helper
and conserve battery.

Two more NickelMenu items are available for one-off use, without starting or stopping the
background helper:

- **Shelf sync now** — a single immediate sync, useful right after changing a book's
  position and not wanting to wait for the next poll.
- **Shelf last sync log** — shows the last 20 lines of `last-error.log`, whether or not the
  automatic sync is running.

## When something goes wrong

- *"no Shelf found on …"* — the Mac is asleep, on a different network, or the app isn't
  running. Nothing found on the whole subnet.
- *"Shelf rejected the token"* — create a new one in Settings and update the config.
- *"nothing to send"* — no downloaded book has been opened on the Kobo yet.
- Anything else is written to `last-error.log` next to the script.

## How close the position lands

`___PercentRead` is how far through Kobo's own rendering you are, while Shelf converts a
percentage to a spot in the text by character count. They agree closely but not exactly —
front and back matter are weighted differently — so expect to land near the right sentence
rather than precisely on it.

Turning that into an audio timestamp also needs the book's EPUB loaded in Shelf **and
aligned**; without alignment there is nothing to convert a position against.

## If NickelMenu disappears

Remove only `nickelmenu-shelf-sync.conf` from `.adds/nm/` first. Do not reinstall KOReader
and do not replace the Kobo database.
