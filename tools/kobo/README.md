# Shelf sync for a stock Kobo

Sends reading positions from the **stock Kobo reader** to Shelf over Wi-Fi. Nothing here
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

The script takes the twenty most recently read downloaded books and posts each position.

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
6. With the Kobo on the same Wi-Fi as the Mac, open the **Shelf sync** entry in NickelMenu.

## Finding Shelf

You don't give it an address. A home network hands out addresses by DHCP, so anything
written down goes stale — which is exactly what happened to the first version of this.

Instead the script tries, in order: the address that worked last time, the optional
`SHELF_HOST` hint if you set one, and then a sweep of whatever network the Kobo is already
on. The sweep opens connections in batches rather than one at a time, so it takes about a
second rather than half a minute. Whatever answers is remembered for next time, so a lease
that moves fixes itself on the next sync.

Setting `SHELF_HOST` is optional and only skips the first sweep.

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
