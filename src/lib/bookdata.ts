/**
 * Looks up real book metadata so the library can show proper cover art instead of the
 * YouTube thumbnail an audiobook upload happens to use.
 *
 * Two free, keyless sources: Open Library and Google Books. They disagree often enough that
 * querying both and ranking the union gives noticeably better matches than either alone.
 */

export type BookCandidate = {
  source: "openlibrary" | "google" | "apple" | "epub";
  title: string;
  authors: string[];
  year: number | null;
  coverUrl: string | null;
  description: string | null;
  publisher: string | null;
  pageCount: number | null;
  /** 0–1, how well this matches what was asked for. */
  score: number;
};

/** Why a source contributed nothing, so an empty grid can explain itself. */
export type SourceStatus = "ok" | "ratelimited" | "error";

export type LookupResult = {
  candidates: BookCandidate[];
  sources: { openlibrary: SourceStatus; google: SourceStatus; apple: SourceStatus };
};

const UA = "Shelf/1.0 (personal audiobook library)";

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|of|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

function scoreMatch(candTitle: string, candAuthors: string[], title: string, author?: string | null) {
  const want = new Set(norm(title).split(" ").filter(Boolean));
  const got = new Set(norm(candTitle).split(" ").filter(Boolean));
  if (want.size === 0 || got.size === 0) return 0;

  let overlap = 0;
  for (const w of want) if (got.has(w)) overlap++;
  let score = overlap / Math.max(want.size, got.size);

  // An author match is strong evidence; audiobook titles are noisy, author names are not.
  if (author) {
    const surname = norm(author).split(" ").filter(Boolean).pop();
    if (surname && candAuthors.some((a) => norm(a).includes(surname))) score += 0.3;
  }
  return Math.min(1, score);
}

async function fromOpenLibrary(
  title: string,
  author?: string | null,
): Promise<{ items: BookCandidate[]; status: SourceStatus }> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", title);
  if (author) url.searchParams.set("author", author);
  url.searchParams.set("limit", "8");
  url.searchParams.set("fields", "title,author_name,first_publish_year,cover_i,publisher,number_of_pages_median");

  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) return { items: [], status: res.status === 429 ? "ratelimited" : "error" };
  const data = await res.json();

  const items = (data.docs ?? []).map((d: Record<string, unknown>) => {
    const authors = (d.author_name as string[]) ?? [];
    const coverId = d.cover_i as number | undefined;
    const t = (d.title as string) ?? "";
    return {
      source: "openlibrary" as const,
      title: t,
      authors,
      year: (d.first_publish_year as number) ?? null,
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
      description: null,
      publisher: ((d.publisher as string[]) ?? [])[0] ?? null,
      pageCount: (d.number_of_pages_median as number) ?? null,
      score: scoreMatch(t, authors, title, author),
    };
  });
  return { items, status: "ok" };
}

async function fromGoogleBooks(
  title: string,
  author?: string | null,
  apiKey?: string | null,
): Promise<{ items: BookCandidate[]; status: SourceStatus }> {
  const q = [`intitle:${title}`, author ? `inauthor:${author}` : ""].filter(Boolean).join("+");
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "8");
  url.searchParams.set("printType", "books");
  // Keyless requests share one global quota that is routinely exhausted by mid-day. A free
  // personal key gets its own, much larger allowance.
  const key = apiKey || process.env.GOOGLE_BOOKS_API_KEY;
  if (key) url.searchParams.set("key", key);

  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) {
    return { items: [], status: res.status === 429 || res.status === 403 ? "ratelimited" : "error" };
  }
  const data = await res.json();

  const items = (data.items ?? []).map((item: Record<string, unknown>) => {
    const v = (item.volumeInfo ?? {}) as Record<string, unknown>;
    const authors = (v.authors as string[]) ?? [];
    const links = (v.imageLinks ?? {}) as Record<string, string>;
    // Google serves http and a curled-edge overlay by default; ask for the clean large one.
    const raw = links.extraLarge ?? links.large ?? links.thumbnail ?? null;
    const cover = raw
      ? raw.replace(/^http:/, "https:").replace(/&edge=curl/, "").replace(/&zoom=\d/, "&zoom=1")
      : null;
    const t = (v.title as string) ?? "";
    const published = (v.publishedDate as string) ?? "";

    return {
      source: "google" as const,
      title: v.subtitle ? `${t}: ${v.subtitle}` : t,
      authors,
      year: published ? Number(published.slice(0, 4)) || null : null,
      coverUrl: cover,
      description: (v.description as string) ?? null,
      publisher: (v.publisher as string) ?? null,
      pageCount: (v.pageCount as number) ?? null,
      score: scoreMatch(t, authors, title, author),
    };
  });
  return { items, status: "ok" };
}

/**
 * Apple's storefront search needs no key and no registration at all, and its catalogue
 * includes the self-published titles Open Library has never heard of.
 */
async function fromAppleBooks(
  title: string,
  author?: string | null,
): Promise<{ items: BookCandidate[]; status: SourceStatus }> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", [title, author].filter(Boolean).join(" "));
  url.searchParams.set("entity", "ebook");
  url.searchParams.set("limit", "8");

  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) return { items: [], status: res.status === 403 ? "ratelimited" : "error" };
  const data = await res.json();

  const items = (data.results ?? []).map((r: Record<string, unknown>) => {
    const t = (r.trackName as string) ?? "";
    const authors = ((r.artistName as string) ?? "").split(/\s*&\s*/).filter(Boolean);
    // The 100px thumbnail is a resize token in the path, not a fixed asset.
    const art = (r.artworkUrl100 as string) ?? null;
    const released = (r.releaseDate as string) ?? "";

    return {
      source: "apple" as const,
      title: t,
      authors,
      year: released ? Number(released.slice(0, 4)) || null : null,
      coverUrl: art ? art.replace(/\/\d+x\d+bb\.jpg$/, "/1200x1200bb.jpg") : null,
      description: stripTags((r.description as string) ?? null),
      publisher: null,
      pageCount: null,
      score: scoreMatch(t, authors, title, author),
    };
  });

  return { items, status: "ok" };
}

async function gather(
  title: string,
  author?: string | null,
  apiKey?: string | null,
): Promise<{ raw: BookCandidate[]; sources: LookupResult["sources"] }> {
  const [ol, gb, ap] = await Promise.allSettled([
    fromOpenLibrary(title, author),
    fromGoogleBooks(title, author, apiKey),
    fromAppleBooks(title, author),
  ]);
  const fail = { items: [] as BookCandidate[], status: "error" as const };
  const olRes = ol.status === "fulfilled" ? ol.value : fail;
  const gbRes = gb.status === "fulfilled" ? gb.value : fail;
  const apRes = ap.status === "fulfilled" ? ap.value : fail;

  return {
    raw: [...olRes.items, ...gbRes.items, ...apRes.items],
    sources: { openlibrary: olRes.status, google: gbRes.status, apple: apRes.status },
  };
}

function pick(raw: BookCandidate[]): BookCandidate[] {
  const all = raw
    // A candidate without art can't fix the thing this exists to fix.
    .filter((c) => c.coverUrl && c.score > 0.25)
    // Open Library exposes its own merge bookkeeping as real records.
    .filter((c) => !/\(duplicate of ol\d/i.test(c.title));

  // Collapse the same edition appearing in several sources, preferring the richer record.
  const seen = new Map<string, BookCandidate>();
  for (const c of all) {
    const key = `${norm(c.title)}|${norm(c.authors[0] ?? "")}`;
    const prev = seen.get(key);
    if (!prev || (c.description && !prev.description) || c.score > prev.score) {
      seen.set(key, c);
    }
  }

  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 12);
}

const STRONG = 0.6;

export async function findBookMetadata(
  title: string,
  author?: string | null,
  apiKey?: string | null,
): Promise<LookupResult> {
  const first = await gather(title, author, apiKey);
  let raw = first.raw;
  let sources = first.sources;
  let best = pick(raw);

  // Retrying on an *empty* result is not enough: Apple answers almost any query with
  // something, so a page of junk would suppress the retry that actually finds the book.
  // Judge on match quality instead, and keep everything seen along the way.
  const weak = () => best.length === 0 || best[0].score < STRONG;

  // The "author" is often the uploading channel rather than a person — "Elite Audiobooks",
  // "Nightstand s" — which both filters and pollutes the search term.
  if (weak() && author) {
    const retry = await gather(title, null, apiKey);
    raw = [...raw, ...retry.raw];
    sources = retry.sources;
    best = pick(raw);
  }

  // Audiobook uploads bolt a marketing subtitle onto the real title.
  const bare = title.split(/[:—–|]/)[0].trim();
  if (weak() && bare.length > 6 && bare !== title) {
    const retry = await gather(bare, null, apiKey);
    raw = [...raw, ...retry.raw.map((c) => ({ ...c, score: scoreMatch(c.title, c.authors, bare) }))];
    sources = retry.sources;
    best = pick(raw);
  }

  return { candidates: best, sources };
}
