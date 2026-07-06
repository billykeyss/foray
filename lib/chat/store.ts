/**
 * Chat session persistence (localStorage) + history→API-message conversion.
 * Pure helpers are exported for node tests; only load/save touch localStorage.
 */

export interface ChatCard {
  tool: string;
  data: unknown;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  cards?: ChatCard[];
  /** true when the user hit Stop mid-stream */
  stopped?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ChatTurn[];
}

const KEY = "foray.chat.sessions.v1";
export const ACTIVE_KEY = "foray.chat.active.v1";
export const MAX_SESSIONS = 30;
export const HISTORY_TURN_CAP = 12;

export function pruneSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions]
    .sort((a, b) => (a.updatedAt === b.updatedAt ? 0 : a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, MAX_SESSIONS);
}

export function createSession(firstUserText: string): ChatSession {
  const now = new Date().toISOString();
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: firstUserText.slice(0, 48),
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

/**
 * Rebuild API context from stored display turns: plain text messages, last
 * HISTORY_TURN_CAP turns, trimmed so the window starts on a user turn (the
 * API requires the first message to be role "user").
 */
export function turnsToMessages(
  turns: ChatTurn[]
): { role: "user" | "assistant"; content: string }[] {
  let window = turns.slice(-HISTORY_TURN_CAP);
  while (window.length && window[0].role !== "user") window = window.slice(1);
  return window.map((t) => ({ role: t.role, content: t.text }));
}

export function loadSessions(): ChatSession[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is ChatSession =>
        !!s && typeof s.id === "string" && Array.isArray(s.turns)
    );
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(pruneSessions(sessions)));
  } catch (err) {
    console.error("chat session save failed", err);
  }
}
