import crypto from "node:crypto";
import { put, del, get, head } from "@vercel/blob";

/**
 * EPUB storage, backed by Vercel Blob instead of the local disk `storage/ebooks/`
 * folder the app used when it only ran on one Mac. `access: "private"` keeps the
 * files from being reachable by a guessed URL — every read goes through this
 * module and the app's own auth-less-but-not-public API routes.
 */

const PREFIX = "ebooks/";

export async function putEbook(bytes: Buffer, ext = "epub"): Promise<{ key: string }> {
  const key = `${crypto.randomUUID()}.${ext}`;
  await put(PREFIX + key, bytes, {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/epub+zip",
  });
  return { key };
}

export async function getEbook(key: string): Promise<Buffer | null> {
  const result = await get(PREFIX + key, { access: "private" }).catch(() => null);
  if (!result || result.statusCode !== 200) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function deleteEbook(key: string): Promise<void> {
  await del(PREFIX + key).catch(() => {});
}

export async function statEbook(key: string): Promise<{ size: number } | null> {
  const meta = await head(PREFIX + key).catch(() => null);
  return meta ? { size: meta.size } : null;
}
