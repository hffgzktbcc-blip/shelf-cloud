# Shelf — YouTube Audiobook Player

A personal, local-only audiobook player for YouTube audiobooks, with chapters, transcripts,
your own EPUBs, and bookmarks — all without leaving the app.

## Running it

Node is installed via nvm, so load it first if your shell hasn't:

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && cd ~/Documents/audiobook-player && npm run dev
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

## Recap (local, free)

The **Recap** tab answers "what just happened?" from the narration you've already heard.
It never sends anything to a paid API.

- With [Ollama](https://ollama.com/download) running, it uses a local model — `llama3.2:3b`
  by default. Install once, then `ollama pull llama3.2:3b`. Nothing to configure; the app
  detects it on the next page load.
- Without Ollama it falls back to sentence extraction: the most representative sentences
  from the last few minutes, ranked by keyword weight. Instant, and it cannot invent
  anything that wasn't said.

**Spoiler safety:** the context window is strictly backwards-looking — only narration at or
before your current position, and chapter titles ahead of you are filtered out too. The
prompt also tells the model to ignore any outside knowledge of the book. The hard window is
the real protection; the prompt is the weaker half, so treat a well-known book with more
suspicion than an obscure one.

First call after a restart takes ~30s while the model loads into memory; subsequent calls
are ~4s.

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

Shelf speaks [KOReader](https://koreader.rocks)'s progress-sync protocol, so a Kobo can push
where you are in the book straight into the app — no cable.

KOReader is a sideloaded reader that sits *alongside* the stock Kobo reader rather than
replacing it, so nothing about the device changes and you can switch back any time. This syncs
KOReader's position, not the stock reader's — stock firmware has no wireless export path, which
is why **From Kobo** (highlights) still needs USB.

**Setup**

1. Install KOReader on the Kobo.
2. On the Mac, find your local address: `ipconfig getifaddr en0`.
3. In KOReader: **Tools → Progress sync → Custom sync server**, and enter
   `http://<that-address>:3000/api/kosync`.
4. Register an account there (it's stored only in this app's database, password hashed).
5. Set **Document matching method** to *filename* — the most reliable pairing with the EPUBs
   you've loaded here.

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
- Data lives in `dev.db` (SQLite) and uploaded EPUBs in `storage/ebooks/`.

## Stack

Next.js 16 · React · Tailwind + shadcn/ui · Prisma 7 + SQLite · epub.js
