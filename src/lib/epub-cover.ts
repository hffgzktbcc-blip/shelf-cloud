import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export type EpubCover = { data: Buffer; contentType: string };

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/**
 * Pulls the cover image out of an EPUB. This is the best source there is — it's the exact
 * edition's own art, needs no network and no API key, and can't mismatch the book.
 *
 * EPUB 2 declares it as `<meta name="cover" content="{manifest-id}">`; EPUB 3 uses
 * `properties="cover-image"` on the manifest item. Files in the wild do either, or neither.
 */
export async function extractEpubCover(filePath: string): Promise<EpubCover | null> {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));

  const opfName = Object.keys(zip.files).find((n) => n.endsWith(".opf"));
  if (!opfName) return null;
  const opf = await zip.file(opfName)!.async("string");
  const opfDir = path.posix.dirname(opfName);

  const href = coverHref(opf);
  const candidates = href
    ? [path.posix.normalize(path.posix.join(opfDir === "." ? "" : opfDir, href))]
    : [];

  // Last resort: an image that simply calls itself a cover.
  candidates.push(
    ...Object.keys(zip.files).filter(
      (n) => /cover/i.test(n) && /\.(jpe?g|png|gif|webp)$/i.test(n),
    ),
  );

  for (const name of candidates) {
    const file = zip.file(name);
    if (!file) continue;
    const data = await file.async("nodebuffer");
    if (data.length === 0) continue;
    return { data, contentType: MIME[path.extname(name).toLowerCase()] ?? "image/jpeg" };
  }

  return null;
}

function coverHref(opf: string): string | null {
  // EPUB 3 first — it points straight at the item.
  const epub3 = opf.match(/<item\b[^>]*properties="[^"]*cover-image[^"]*"[^>]*>/i);
  const fromEpub3 = epub3 && epub3[0].match(/href="([^"]+)"/i);
  if (fromEpub3) return decodeURIComponent(fromEpub3[1]);

  // EPUB 2 indirection: <meta name="cover" content="ID"> then the manifest item with that id.
  const metaId = opf.match(/<meta\b[^>]*name="cover"[^>]*content="([^"]+)"/i)?.[1];
  if (metaId) {
    const escaped = metaId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const item = opf.match(new RegExp(`<item\\b[^>]*id="${escaped}"[^>]*>`, "i"));
    const href = item && item[0].match(/href="([^"]+)"/i);
    if (href) return decodeURIComponent(href[1]);
  }

  return null;
}
