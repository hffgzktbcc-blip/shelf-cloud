import { locateInBlocks } from "@/lib/kindle";

export type IncomingHighlight = {
  text: string;
  note: string | null;
  bookTitle?: string | null;
  bookAuthor?: string | null;
};

export type PlacedHighlight = IncomingHighlight & {
  blockIndex: number | null;
  timeSec: number | null;
  partId: string | null;
};

type Mark = { blockIndex: number | null; timeSec: number; partId: string };

/**
 * Turns highlights into positions on the audio timeline: find the passage in the book's own
 * text, then convert that block index to a timestamp through the transcript alignment.
 * Shared by the Kindle and Kobo importers — the only difference between them is where the
 * highlights came from.
 */
export function placeHighlights(
  highlights: IncomingHighlight[],
  blocks: { index: number; text: string }[],
  syncMarks: Mark[],
): { placed: PlacedHighlight[]; canPlace: boolean } {
  const marks = syncMarks
    .filter((m) => m.blockIndex != null)
    .sort((a, b) => a.blockIndex! - b.blockIndex!);

  const canPlace = blocks.length > 0 && marks.length > 0;
  if (!canPlace) {
    return {
      canPlace,
      placed: highlights.map((h) => ({ ...h, blockIndex: null, timeSec: null, partId: null })),
    };
  }

  const placed = highlights.map((h) => {
    const blockIndex = locateInBlocks(h.text, blocks);
    if (blockIndex === null) return { ...h, blockIndex: null, timeSec: null, partId: null };

    let before = marks[0];
    let after: Mark | null = null;
    for (const m of marks) {
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

    return { ...h, blockIndex, timeSec, partId: before.partId };
  });

  return { placed, canPlace };
}
