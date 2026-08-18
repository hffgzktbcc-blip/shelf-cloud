/**
 * Shelves are stored as search intents, not as fixed title lists. Every open runs a live
 * YouTube search, so a shelf can never drift out of date the way a hardcoded list does.
 */
export type Genre = {
  slug: string;
  label: string;
  query: string;
  blurb: string;
};

export const GENRES: Genre[] = [
  {
    slug: "classics",
    label: "Classics",
    query: "classic literature full audiobook unabridged",
    blurb: "Public-domain novels, usually complete and well narrated",
  },
  {
    slug: "scifi",
    label: "Sci-Fi",
    query: "science fiction full audiobook unabridged",
    blurb: "Space opera, cyberpunk, and hard SF",
  },
  {
    slug: "fantasy",
    label: "Fantasy",
    query: "fantasy full audiobook unabridged",
    blurb: "Epic, dark, and high fantasy",
  },
  {
    slug: "mystery",
    label: "Mystery & Crime",
    query: "mystery detective full audiobook unabridged",
    blurb: "Whodunnits, noir, and detective serials",
  },
  {
    slug: "horror",
    label: "Horror",
    query: "horror full audiobook unabridged",
    blurb: "Gothic, cosmic, and modern horror",
  },
  {
    slug: "thriller",
    label: "Thriller",
    query: "thriller suspense full audiobook unabridged",
    blurb: "Tension, spies, and page-turners",
  },
  {
    slug: "history",
    label: "History",
    query: "history full audiobook unabridged",
    blurb: "Narrative history and biography",
  },
  {
    slug: "business",
    label: "Business & Self-Help",
    query: "business self improvement full audiobook unabridged",
    blurb: "Strategy, habits, and personal development",
  },
  {
    slug: "philosophy",
    label: "Philosophy",
    query: "philosophy full audiobook unabridged",
    blurb: "Stoicism, ethics, and the canon",
  },
  {
    slug: "sleep",
    label: "Sleep & Calm",
    query: "sleep story calm bedtime full audiobook",
    blurb: "Slow, quiet readings for winding down",
  },
];
