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

## Notes

- Playback uses YouTube's official embedded IFrame player — nothing is downloaded or
  re-hosted, so this stays within YouTube's terms.
- Transcripts depend on the uploader enabling captions; many audiobook channels do, some don't.
  The app degrades gracefully when they're missing.
- Data lives in `dev.db` (SQLite) and uploaded EPUBs in `storage/ebooks/`.

## Stack

Next.js 16 · React · Tailwind + shadcn/ui · Prisma 7 + SQLite · epub.js
