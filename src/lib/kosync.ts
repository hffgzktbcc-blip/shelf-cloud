import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";

/**
 * KOReader's progress-sync protocol, as spoken by the `sync.koreader.rocks` server.
 * Implementing it here means a Kobo running KOReader can push its reading position to
 * Shelf over WiFi — no cable, and nothing leaves the machine.
 *
 * Everything lives in the Setting key/value table so no schema migration is needed.
 */

export const ACCEPT = "application/vnd.koreader.v1+json";

export type Progress = {
  document: string;
  /** The filename the device sent, kept so an unmatched sync is recognisable. */
  label?: string;
  progress: string;
  percentage: number;
  device: string;
  device_id?: string;
  timestamp: number;
};

const STORAGE_DIR = path.join(process.cwd(), "storage", "ebooks");

const USER_KEY = "kosync.user";
const progressKey = (doc: string) => `kosync.progress.${doc}`;
const bindKey = (doc: string) => `kosync.bind.${doc}`;

export function md5(s: string | Buffer): string {
  return crypto.createHash("md5").update(s).digest("hex");
}

/**
 * KOReader identifies a document by one of two hashes, chosen in its settings.
 *
 * "filename" is just the MD5 of the base name. "binary" is an MD5 over a handful of 1KB
 * samples taken at doubling offsets — the exact offset sequence differs between KOReader
 * builds, so several plausible variants are returned and any match is accepted. If none
 * match, the document can still be bound to a book by hand, once.
 */
export function documentHashes(filePath: string, fileName: string): string[] {
  const out = new Set<string>();
  for (const name of nameVariants(fileName)) out.add(md5(name));

  try {
    const fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;

    for (const start of [-1, 0]) {
      const h = crypto.createHash("md5");
      let any = false;
      for (let i = start; i <= 10; i++) {
        const offset = i < 0 ? 1024 >> -(2 * i) : 1024 << (2 * i);
        if (offset >= size) break;
        const buf = Buffer.alloc(1024);
        const read = fs.readSync(fd, buf, 0, 1024, offset);
        if (read <= 0) break;
        h.update(buf.subarray(0, read));
        any = true;
      }
      if (any) out.add(h.digest("hex"));
    }

    fs.closeSync(fd);
  } catch {
    // A missing or unreadable file just means no content hashes; the name hashes still work.
  }

  return [...out];
}

/**
 * A Kobo does not keep the filename you gave it. Sideloaded books are converted to Kobo's
 * own format and lowercased, so `Light_Bringer.epub` becomes
 * `light_bringer.kepub.epub` — a different MD5, and a different file, so neither the name
 * nor the content hash matches. Generating the transformed names here is what lets a
 * KOReader sync find its book without the user binding it by hand.
 */
function nameVariants(fileName: string): string[] {
  const base = path.basename(fileName);
  const stripped = base.replace(/\.kepub\.epub$/i, ".epub");

  const out = new Set<string>();
  for (const n of [base, stripped]) {
    for (const cased of [n, n.toLowerCase()]) {
      out.add(cased);
      // And the Kobo-converted form of each.
      out.add(cased.replace(/\.epub$/i, ".kepub.epub"));
    }
  }
  return [...out];
}

export async function getUser(): Promise<{ username: string; key: string } | null> {
  const row = await prisma.setting.findUnique({ where: { key: USER_KEY } });
  return row ? (JSON.parse(row.value) as { username: string; key: string }) : null;
}

export async function setUser(username: string, key: string): Promise<void> {
  const value = JSON.stringify({ username, key });
  await prisma.setting.upsert({
    where: { key: USER_KEY },
    create: { key: USER_KEY, value },
    update: { value },
  });
}

/** KOReader sends the password already MD5'd, so only that digest is ever stored. */
export async function checkAuth(username?: string, key?: string): Promise<boolean> {
  if (!username || !key) return false;
  const user = await getUser();
  return !!user && user.username === username && user.key === key;
}

export async function putProgress(p: Progress): Promise<void> {
  const value = JSON.stringify(p);
  await prisma.setting.upsert({
    where: { key: progressKey(p.document) },
    create: { key: progressKey(p.document), value },
    update: { value },
  });
}

/** Finds the Shelf reading percentage that corresponds to the current audio position. */
export async function shelfPercentage(document: string): Promise<number | null> {
  const ebooks = await prisma.ebook.findMany({
    include: {
      book: {
        select: {
          lastPartId: true,
          parts: { select: { id: true, positionSec: true }, orderBy: { order: "asc" } },
        },
      },
      syncMarks: { select: { blockIndex: true, timeSec: true, partId: true } },
    },
  });

  const ebook = ebooks.find((candidate) => {
    if (!candidate.filePath) return false;
    return documentHashes(path.join(STORAGE_DIR, candidate.filePath), candidate.fileName).includes(document);
  });
  if (!ebook || !ebook.book.lastPartId) return null;

  const part = ebook.book.parts.find((candidate) => candidate.id === ebook.book.lastPartId);
  if (!part || !ebook.blocksJson) return null;

  const marks = ebook.syncMarks
    .filter((mark) => mark.partId === part.id && mark.blockIndex !== null)
    .sort((a, b) => a.timeSec - b.timeSec);
  if (marks.length === 0) return null;

  const before = [...marks].reverse().find((mark) => mark.timeSec <= part.positionSec) ?? marks[0];
  const after = marks.find((mark) => mark.timeSec > part.positionSec);
  let blockIndex = before.blockIndex!;
  if (after && after.timeSec !== before.timeSec) {
    const fraction = (part.positionSec - before.timeSec) / (after.timeSec - before.timeSec);
    blockIndex = Math.round(before.blockIndex! + fraction * (after.blockIndex! - before.blockIndex!));
  }

  const blocks = (JSON.parse(ebook.blocksJson).blocks ?? []) as { index: number; text: string }[];
  const total = blocks.reduce((sum, block) => sum + block.text.length, 0);
  if (total === 0) return null;
  const seen = blocks.slice(0, blocks.findIndex((block) => block.index >= blockIndex) + 1)
    .reduce((sum, block) => sum + block.text.length, 0);
  return Math.max(0, Math.min(1, seen / total));
}

export async function getProgress(document: string): Promise<Progress | null> {
  const row = await prisma.setting.findUnique({ where: { key: progressKey(document) } });
  return row ? (JSON.parse(row.value) as Progress) : null;
}

/** Every document hash Shelf has seen, newest first. */
export async function listProgress(): Promise<Progress[]> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: "kosync.progress." } } });
  return rows
    .map((r) => JSON.parse(r.value) as Progress)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function bindDocument(document: string, ebookId: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: bindKey(document) },
    create: { key: bindKey(document), value: ebookId },
    update: { value: ebookId },
  });
}

export async function getBinding(document: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: bindKey(document) } });
  return row?.value ?? null;
}

export type ResolvedPosition = {
  document: string;
  /** Something human-readable for an unmatched sync, when the device sent a path. */
  label?: string | null;
  device: string;
  percentage: number;
  updatedAt: number;
  bookId: string | null;
  bookTitle: string | null;
  /** Null when there is no timeline mapping for this spot — see `coverage`. */
  timeSec: number | null;
  partId: string | null;
  blockIndex: number | null;
  /**
   * "ok"        — mapped to a real timestamp
   * "before"/"after" — this passage falls outside the audio you have (e.g. the ebook is the
   *                whole novel but the audio is only Part 3)
   * "unaligned" — no ebook alignment exists yet
   * "unknown"   — the document could not be matched to a book
   */
  coverage: "ok" | "before" | "after" | "unaligned" | "unknown";
};

type Blk = { index: number; text: string };

/**
 * KOReader reports a fraction of the whole book. Characters, not paragraph counts, are what
 * that fraction is really measured against, so the block is found by cumulative text length.
 */
export function blockAtPercentage(blocks: Blk[], percentage: number): number | null {
  if (blocks.length === 0) return null;
  const total = blocks.reduce((s, b) => s + b.text.length, 0);
  if (total === 0) return null;

  const target = Math.max(0, Math.min(1, percentage)) * total;
  let seen = 0;
  for (const b of blocks) {
    seen += b.text.length;
    if (seen >= target) return b.index;
  }
  return blocks[blocks.length - 1].index;
}

/**
 * Interpolates a block index onto the audio timeline through the transcript sync marks.
 *
 * The marks only span the audio that actually exists. An ebook is usually the whole novel
 * while a YouTube upload is often one part of it, so a position can legitimately fall
 * outside the aligned range — that is reported, never clamped, because silently returning
 * the first mark would send the listener to 0:00 and call it a match.
 */
export function timeAtBlock(
  blockIndex: number,
  marks: { blockIndex: number | null; timeSec: number; partId: string }[],
): { timeSec: number; partId: string; coverage: "ok" } | { coverage: "before" | "after" | "unaligned" } {
  const sorted = marks
    .filter((m) => m.blockIndex != null)
    .sort((a, b) => a.blockIndex! - b.blockIndex!);
  if (sorted.length === 0) return { coverage: "unaligned" };

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (blockIndex < first.blockIndex!) return { coverage: "before" };
  if (blockIndex > last.blockIndex!) return { coverage: "after" };

  let before = first;
  let after: (typeof sorted)[number] | null = null;
  for (const m of sorted) {
    if (m.blockIndex! <= blockIndex) before = m;
    else {
      after = m;
      break;
    }
  }

  let timeSec = before.timeSec;
  if (after && after.blockIndex! !== before.blockIndex!) {
    const frac = (blockIndex - before.blockIndex!) / (after.blockIndex! - before.blockIndex!);
    timeSec = before.timeSec + frac * (after.timeSec - before.timeSec);
  }
  return { timeSec, partId: before.partId, coverage: "ok" };
}
