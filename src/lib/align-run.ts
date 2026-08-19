/**
 * Runs an alignment from the browser: fetch the book's text, fetch the narration, match
 * them, save the sync points. Extracted from the reader so alignment can also be started
 * from the Ebooks page, where the state actually lives.
 *
 * Stays client-side because the matching is CPU-bound over the whole book and would block
 * a request handler for seconds.
 */

export type AlignOutcome = {
  partId: string;
  points: number;
  error?: string;
};

type Part = { id: string; videoId: string };

export async function alignEbookToParts(
  ebookId: string,
  parts: Part[],
  onProgress?: (message: string) => void,
): Promise<AlignOutcome[]> {
  onProgress?.("Reading the book…");
  const contentRes = await fetch(`/api/ebooks/${ebookId}/content`);
  const content = await contentRes.json();
  const blocks = (content.blocks ?? []) as { text: string }[];
  if (blocks.length === 0) throw new Error("That EPUB has no readable text.");

  const alignBlocks = blocks.map((b) => ({
    chars: b.text.length,
    tokens: b.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean),
  }));

  const { alignTranscriptToBook } = await import("@/lib/align");
  const out: AlignOutcome[] = [];

  for (const [i, part] of parts.entries()) {
    onProgress?.(
      parts.length > 1 ? `Matching part ${i + 1} of ${parts.length}…` : "Matching narration…",
    );

    try {
      const res = await fetch(`/api/youtube/transcript/${part.videoId}`);
      const data = await res.json();
      const cues = data.cues ?? [];
      if (cues.length === 0) {
        out.push({ partId: part.id, points: 0, error: "no transcript" });
        continue;
      }

      const points = alignTranscriptToBook(cues, alignBlocks);
      if (points.length === 0) {
        out.push({ partId: part.id, points: 0, error: "no confident matches" });
        continue;
      }

      const save = await fetch("/api/syncmarks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ebookId,
          partId: part.id,
          replace: true,
          marks: points.map((p) => ({ timeSec: p.timeSec, blockIndex: p.blockIndex })),
        }),
      });
      if (!save.ok) {
        const err = await save.json().catch(() => ({}));
        out.push({ partId: part.id, points: 0, error: err.error ?? "could not save" });
        continue;
      }

      out.push({ partId: part.id, points: points.length });
    } catch (e) {
      out.push({ partId: part.id, points: 0, error: (e as Error).message });
    }
  }

  return out;
}
