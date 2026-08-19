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
2. On the Mac, get its address on your network:

   ```
   ipconfig getifaddr en0
   ```

   Use `en1` if Wi-Fi is on that interface.
3. Copy `shelf-sync.sh`, `shelf-sync.lua` and `shelf-sync.conf` to the Kobo at
   `.adds/shelf-sync/`.
4. Edit **`shelf-sync.conf`** — the address from step 2 and the token from step 1. The
   scripts themselves never need editing.
5. Copy `nickelmenu-shelf-sync.conf` to `.adds/nm/`.
6. Eject the Kobo cleanly and let NickelMenu reload.
7. With the Kobo on the same Wi-Fi as the Mac, open the **Shelf sync** entry in NickelMenu.

The address must be the Mac's, not `localhost` — on the Kobo, `localhost` is the Kobo.

## When it stops working

Almost always the Mac's address has changed. A DHCP lease moves and the script is still
pointing at the old one; you'll get *"cannot reach Shelf at …"* naming the address it tried.
Re-run `ipconfig getifaddr en0` and update `shelf-sync.conf`.

If that keeps happening, give the Mac a fixed address in your router's DHCP reservations.

Other messages:

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
