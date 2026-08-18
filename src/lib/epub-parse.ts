import JSZip from "jszip";

/**
 * Parses an EPUB into a flat, ordered list of text blocks.
 *
 * epub.js renders into an iframe with the publisher's own stylesheet, which is what made the
 * text unreadable against a dark UI and left every paragraph unaddressable. Extracting the
 * text ourselves lets the reader render as ordinary app DOM: themeable, clickable, and
 * highlightable, with a stable index per block to sync against.
 */

export type EpubBlock = {
  /** Position in the whole book — the identifier everything else syncs against. */
  index: number;
  kind: "heading" | "para";
  text: string;
  /** Index into `chapters`, for the running header and the contents list. */
  chapter: number;
};

export type EpubChapter = { index: number; title: string; firstBlock: number };

export type ParsedEpub = {
  title: string | null;
  author: string | null;
  chapters: EpubChapter[];
  blocks: EpubBlock[];
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", eacute: "é", egrave: "è", agrave: "à",
  ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä", szlig: "ß", copy: "©", deg: "°",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolves an href that is relative to the OPF file's own directory. */
function resolveHref(opfPath: string, href: string): string {
  const base = opfPath.includes("/") ? opfPath.replace(/\/[^/]*$/, "/") : "";
  const joined = `${base}${href}`.replace(/[^/]+\/\.\.\//g, "");
  return decodeURIComponent(joined.replace(/^\.\//, ""));
}

export async function parseEpub(data: Buffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(data);

  // container.xml points at the OPF, which holds the metadata, manifest and spine order.
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("Not a valid EPUB (no META-INF/container.xml)");
  const container = await containerFile.async("string");
  const opfPath = container.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error("Could not find the EPUB package file");

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error("EPUB package file is missing");
  const opf = await opfFile.async("string");

  const title = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1];
  const author = opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1];

  // manifest id -> href
  const manifest = new Map<string, string>();
  for (const m of opf.matchAll(/<item\b[^>]*\/?>/gi)) {
    const tag = m[0];
    const id = tag.match(/\sid="([^"]+)"/i)?.[1];
    const href = tag.match(/\shref="([^"]+)"/i)?.[1];
    if (id && href) manifest.set(id, href);
  }

  // spine gives the reading order
  const spine: string[] = [];
  const spineBlock = opf.match(/<spine[\s\S]*?<\/spine>/i)?.[0] ?? "";
  for (const m of spineBlock.matchAll(/<itemref\b[^>]*idref="([^"]+)"[^>]*>/gi)) {
    const href = manifest.get(m[1]);
    if (href) spine.push(resolveHref(opfPath, href));
  }

  const blocks: EpubBlock[] = [];
  const chapters: EpubChapter[] = [];

  for (const href of spine) {
    const file = zip.file(href);
    if (!file) continue;

    let html: string;
    try {
      html = await file.async("string");
    } catch {
      continue;
    }

    const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;

    // One entry per block-level element, in document order.
    const matches = [
      ...bodyHtml.matchAll(
        /<(h[1-6]|p|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi,
      ),
    ];

    for (const m of matches) {
      const tag = m[1].toLowerCase();
      const text = stripTags(m[2]);
      if (!text) continue;

      // Every heading starts a chapter — many EPUBs pack several chapters into one
      // spine file, so opening only on the first heading badly under-counts them.
      const isHeading = /^h[1-3]$/.test(tag);
      if (isHeading) {
        chapters.push({ index: chapters.length, title: text, firstBlock: blocks.length });
      } else if (chapters.length === 0) {
        // Prose before any heading still needs somewhere to live.
        chapters.push({ index: 0, title: "Start", firstBlock: 0 });
      }

      blocks.push({
        index: blocks.length,
        kind: /^h[1-6]$/.test(tag) ? "heading" : "para",
        text,
        chapter: chapters.length - 1,
      });
    }
  }

  if (blocks.length === 0) throw new Error("No readable text found in this EPUB");

  return {
    title: title ? stripTags(title) : null,
    author: author ? stripTags(author) : null,
    chapters,
    blocks,
  };
}
