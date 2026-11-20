/** A one-shot journal draft handed from elsewhere in the app (Forage Finder's "Log find") to /journal,
 *  via localStorage so no query string is needed (offline navigations stay precache hits). */
export const JOURNAL_DRAFT_KEY = "foray.journal-draft.v1";

export interface JournalDraft {
  species: string;
  lat?: number;
  lon?: number;
  notes?: string;
}

export function parseJournalDraft(raw: string | null): JournalDraft | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v.species !== "string") return null;
    return {
      species: v.species.slice(0, 120),
      lat: Number.isFinite(v.lat) ? v.lat : undefined,
      lon: Number.isFinite(v.lon) ? v.lon : undefined,
      notes: typeof v.notes === "string" ? v.notes.slice(0, 1000) : undefined,
    };
  } catch {
    return null;
  }
}

/** Read and clear the pending draft (never throws). */
export function takeJournalDraft(): JournalDraft | null {
  try {
    const d = parseJournalDraft(localStorage.getItem(JOURNAL_DRAFT_KEY));
    localStorage.removeItem(JOURNAL_DRAFT_KEY);
    return d;
  } catch {
    return null;
  }
}
