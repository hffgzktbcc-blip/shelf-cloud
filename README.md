# Shelf — YouTube Audiobook Player

A personal audiobook player for YouTube audiobooks, with chapters, transcripts, your own
EPUBs, and bookmarks — all without leaving the app. This fork runs as a hosted Vercel
deployment (Postgres for data, Vercel Blob for EPUB files) instead of a local Mac server, so
it's reachable from a phone with the Mac off.

## Running it

Deployed on Vercel from this repo's `main`/`covers-kobo-sync-and-contrast` branch — pushes
build and deploy automatically. To run it locally against the same hosted database and
storage, set `DATABASE_URL` (Supabase Postgres, pooled connection string) and
`BLOB_READ_WRITE_TOKEN` in `.env`, then:

```bash
npm run dev
```

Then open http://localhost:3000

## What it does

- **Welcome screen** (`/welcome`) — a short first-run intro with a preview of the layout.
  It appears automatically only when the library is empty and hasn't been dismissed; after
  that the app opens straight to your library. You can revisit it any time at `/welcome`.
- **Discover** — search YouTube for audiobooks from inside the app, browse genre shelves, or
  paste any video link. Results are filtered to long videos, where full audiobooks live.
  Shelves run a live search each time, so they can't go stale.
- **Tidy titles** — "MOBY DICK by Herman Melville | FULL AudioBook (Part 1/3)" becomes
  **Moby Dick** by *Herman Melville*, Part 1 of 3. The raw YouTube title is always kept on the
  part, so nothing is lost — use "Tidy title" on a book page to re-run it.
- **Chapters** — pulled from the video's own chapter markers, falling back to timestamps in the
  description. When an upload has neither, "Find chapters from narration" reads the transcript
  for the narrator's own "Chapter One / Chapter Two" announcements and builds chapters from
  those. Clicking one seeks the video.
- **Audio-only mode** — swap the video for cover art when you just want to listen.
- **Transcript** — fetched from the video's captions, follows along as it plays, and is
  searchable. Click any line to jump there.
- **Your ebook** — upload an EPUB per book. Set "sync points" that anchor a page to a
  timestamp; with those in place, "Follow audio" turns the pages as the narration moves.
- **Bookmarks** — press `B` while listening. Position is saved continuously, so every book
  resumes exactly where you left it.
- **Multi-part books** — add later parts by link, or use "Find the next parts" to search
  YouTube for the rest of the book and the same narrator's other uploads.
- **Buy links** — search links for Audible, Amazon, Kobo, Libro.fm, Bookshop.org, Google Books.

## Recap (free, no model)

The **Recap** tab answers "what just happened?" from the narration you've already heard. It
never sends anything to a paid API and needs no model: it picks the most representative
sentences from the last few minutes, ranked by keyword weight. Instant, and it cannot invent
anything that wasn't said.

**Spoiler safety:** the context window is strictly backwards-looking — only narration at or
before your current position is ever used.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Back 15s / forward 30s |
| `B` | Bookmark the current moment |

## Optional: YouTube API key

Search works without one by reading YouTube's public results page. Adding a
[YouTube Data API key](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
in Settings makes search more reliable. It's stored in the local database only.

## Cover art

**Find cover** on a book page replaces the YouTube thumbnail with real jacket art. It checks
four sources, none of which need an API key:

1. **The EPUB you loaded** — the exact edition's own cover, read straight out of the file.
   No network, no key, and it can't match the wrong book. Always offered first.
2. **Open Library** — strong on traditionally published books.
3. **Apple Books** — keyless and unregistered, and it carries the self-published titles
   Open Library has never catalogued.
4. **Google Books** — optional, see below.

Covers are contained rather than cropped, so portrait jackets and 16:9 thumbnails sit on the
same shelf without losing their tops.

### Optional: Google Books API key

Google Books' keyless endpoint shares one global daily quota that is usually already spent, so
it normally returns `429` and contributes nothing. The picker says so rather than pretending
there were no results. A free personal key gets its own, much larger allowance:

1. Create a key at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   and enable the **Books API** for the project.
2. Add it to `.env`:

   ```
   GOOGLE_BOOKS_API_KEY="your-key-here"
   ```

3. Restart the dev server.

The other three sources work regardless.

## Reading position from your Kobo, over WiFi

Shelf supports the stock Kobo reader on the Clara Colour through the installed Shelf sync entry.
USB is only needed once to install the helper files. After that, open **NickelMenu → Shelf sync**
while the Kobo has WiFi: the helper reads the stock reader's position, sends it to Shelf, and
writes any newer Shelf position back to the Kobo. KOReader is not needed for the stock-reader flow.

The Kobo helper must point at this deployment's URL, not a Mac's local address — update the
helper's `SHELF_URL` in `.adds/shelf-sync/` to the Vercel domain.

Stock Kobo firmware does not expose a network listener for Shelf to wake or push to on its own, so
the sync must currently be started from the Kobo. It does not require plugging the Kobo in again.

Shelf also retains a KOReader-compatible endpoint for users who already use KOReader, but it is
not required for stock-reader sync.

**Setup**

1. Install KOReader on the Kobo.
2. In KOReader: **Tools → Progress sync → Custom sync server**, and enter
   `https://<this-deployment>/api/kosync`.
3. Register an account there (it's stored only in this app's database, password hashed).
4. Set **Document matching method** to *filename*.

Filename matching handles the Kobo's own renaming: sideloaded books get converted to
`.kepub.epub` and lowercased, so `Light_Bringer.epub` on your Mac is
`light_bringer.kepub.epub` on the device. Shelf checks both forms. If a sync still lands
unmatched, the book page offers a **This book** button to link it once, and remembers it.

Close a book on the Kobo and the position appears on that book's page in Shelf, with a button
to jump the audio to the matching moment.

**What it can and can't map**

The jump needs an EPUB loaded *and* Auto-sync run, because the position is converted
ebook-text → transcript → timestamp. If the passage falls outside the audio you have — an
ebook is the whole novel, while a YouTube upload is often just one part — Shelf says so rather
than sending you to 0:00.

## Notes

- Playback uses YouTube's official embedded IFrame player — nothing is downloaded or
  re-hosted, so this stays within YouTube's terms.
- Transcripts depend on the uploader enabling captions; many audiobook channels do, some don't.
  The app degrades gracefully when they're missing.
- Data lives in Postgres (Supabase) and uploaded EPUBs in Vercel Blob.

## Stack

Next.js 16 · React · Tailwind + shadcn/ui · Prisma 7 + Postgres · Vercel Blob · epub.js
