export type Chapter = {
  id: string;
  partId: string;
  title: string;
  startSec: number;
  endSec: number | null;
  order: number;
};

export type Part = {
  id: string;
  bookId: string;
  videoId: string;
  title: string;
  order: number;
  duration: number;
  thumbUrl: string | null;
  channel: string | null;
  positionSec: number;
  completed: boolean;
  transcriptState: string;
  chapters?: Chapter[];
};

export type SyncMark = {
  id: string;
  ebookId: string;
  partId: string;
  timeSec: number;
  cfi: string;
  blockIndex: number | null;
  label: string | null;
};

export type Ebook = {
  id: string;
  bookId: string;
  fileName: string;
  filePath: string;
  format: string;
  cfi: string | null;
  progress: number;
  syncMarks?: SyncMark[];
};

export type Bookmark = {
  id: string;
  bookId: string;
  partId: string;
  timeSec: number;
  note: string | null;
  label: string | null;
  createdAt: string;
  part?: { title: string; videoId: string; order: number };
};

export type Book = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  narrator: string | null;
  series: string | null;
  finished: boolean;
  favorite: boolean;
  lastPartId: string | null;
  createdAt: string;
  updatedAt: string;
  parts: Part[];
  ebooks: Ebook[];
  bookmarks?: Bookmark[];
  _count?: { bookmarks: number };
};

export type TranscriptCue = { start: number; dur: number; text: string };

export type AiMessage = {
  id: string;
  bookId: string;
  partId: string;
  timeSec: number;
  kind: string;
  question: string;
  answer: string;
  createdAt: string;
};

export type SearchHit = {
  videoId: string;
  title: string;
  channel: string;
  thumbUrl: string;
  durationText: string;
  durationSec: number;
};
