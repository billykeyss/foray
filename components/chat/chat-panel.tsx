"use client";

import { useEffect, useRef, useState } from "react";
import { useApiKey } from "@/lib/api-key-context";
import { useLocation } from "@/lib/location-context";
import { useRegion } from "@/lib/region-context";
import { useOnline } from "@/lib/use-online";
import ApiKeyDialog from "@/components/api-key-dialog";
import ChatMarkdown from "@/components/chat/chat-markdown";
import ChatCardView from "@/components/chat/chat-cards";
import { runChatTurn, MAX_TOOL_TURNS } from "@/lib/chat/agent.ts";
import {
  createSession,
  loadSessions,
  saveSessions,
  turnsToMessages,
  type ChatCard,
  type ChatSession,
  type ChatTurn,
} from "@/lib/chat/store.ts";
import { SAFETY_DISCLAIMER } from "@/lib/chat/prompt.ts";

const SUGGESTED = [
  "What's fruiting near me this week?",
  "How do I tell a matsutake from its dangerous lookalikes?",
  "Where should I forage this weekend?",
  "What did I find last fall?",
];

const TOOL_LABEL: Record<string, string> = {
  search_catalog: "Searching the catalog…",
  get_species: "Reading the field guide…",
  get_weather: "Checking conditions…",
  find_spots: "Scoring nearby spots…",
  read_journal: "Reading your journal…",
  web_search: "Searching the web…",
};

type View = "chat" | "history";

export default function ChatPanel() {
  const { apiKey, hasKey, loaded } = useApiKey();
  const { lat, lon, label: locationLabel } = useLocation();
  const { def: regionDef } = useRegion();
  const online = useOnline();

  const [view, setView] = useState<View>("chat");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [active, setActive] = useState<ChatSession | null>(null); // null = fresh screen
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamCards, setStreamCards] = useState<ChatCard[]>([]);
  const [toolNote, setToolNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSessions(loadSessions()), []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.turns.length, streamText, streamCards.length]);

  function persist(next: ChatSession) {
    setActive(next);
    setSessions((prev) => {
      const merged = [next, ...prev.filter((s) => s.id !== next.id)];
      saveSessions(merged);
      return merged;
    });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || !apiKey) return;
    setError(null);
    setInput("");

    // Lazy session creation (Keeper pattern)
    const base = active ?? createSession(trimmed);
    const userTurn: ChatTurn = { role: "user", text: trimmed };
    const withUser: ChatSession = {
      ...base,
      updatedAt: new Date().toISOString(),
      turns: [...base.turns, userTurn],
    };
    persist(withUser);

    setSending(true);
    setStreamText("");
    setStreamCards([]);
    const cards: ChatCard[] = [];
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await runChatTurn({
        apiKey,
        messages: turnsToMessages(withUser.turns) as Parameters<typeof runChatTurn>[0]["messages"],
        context: {
          todayISO: new Date().toISOString().slice(0, 10),
          regionLabel: regionDef.label,
          locationLabel,
          lat,
          lon,
        },
        toolContext: { lat, lon, locationLabel, regionId: regionDef.id },
        signal: controller.signal,
        callbacks: {
          onTextDelta: (d) => setStreamText((t) => t + d),
          onToolNote: (name) => setToolNote(TOOL_LABEL[name] ?? "Working…"),
          onCard: (c) => {
            cards.push(c);
            setStreamCards([...cards]);
          },
        },
      });

      let finalText = result.text;
      let stopped = false;
      if (result.stopReason === "aborted") {
        // agent.ts normalizes user cancellation into a RunResult — no SDK
        // error type ever reaches this component.
        stopped = true;
        finalText = finalText ? `${finalText}\n\n_(stopped)_` : "_(stopped)_";
      } else if (result.stopReason === "refusal") {
        finalText = finalText || "Claude declined this request.";
      } else if (result.exhausted) {
        finalText += `\n\n_(stopped after ${MAX_TOOL_TURNS} tool rounds)_`;
      } else if (result.stopReason === "max_tokens") {
        finalText += "\n\n_(response truncated)_";
      }
      persist({
        ...withUser,
        updatedAt: new Date().toISOString(),
        turns: [...withUser.turns, { role: "assistant", text: finalText, cards, stopped }],
      });
    } catch (err: unknown) {
      const anyErr = err as { status?: number; message?: string };
      if (anyErr.status === 401) {
        setError("Your API key was rejected — check it in Settings.");
        setKeyDialogOpen(true);
      } else if (anyErr.status === 429) {
        setError("Rate limited by the API — wait a minute and try again.");
      } else {
        setError(anyErr.message ?? "Something went wrong.");
      }
    } finally {
      setSending(false);
      setToolNote(null);
      setStreamText("");
      setStreamCards([]);
      abortRef.current = null;
    }
  }

  if (!loaded) return null;

  if (!hasKey) {
    return (
      <div className="p-6 text-center">
        <p className="mb-3 text-sm">
          Ask needs your Anthropic API key (stored only in this browser, same as the spot finder).
        </p>
        <button
          className="rounded border px-4 py-2 text-sm"
          style={{ borderColor: "var(--line)" }}
          onClick={() => setKeyDialogOpen(true)}
        >
          Add API key
        </button>
        <ApiKeyDialog open={keyDialogOpen} onClose={() => setKeyDialogOpen(false)} />
      </div>
    );
  }

  if (view === "history") {
    return (
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">History</h2>
          <button className="text-sm underline" onClick={() => setView("chat")}>
            Back
          </button>
        </div>
        {sessions.length === 0 && <p className="text-sm">No conversations yet.</p>}
        {sessions.map((s) => (
          <button
            key={s.id}
            className="block w-full border-b py-2 text-left"
            style={{ borderColor: "var(--line)" }}
            onClick={() => {
              setActive(s);
              setView("chat");
            }}
          >
            <span className="block truncate text-sm">{s.title}</span>
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {s.turns.length} messages · {s.updatedAt.slice(0, 10)}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--line)" }}>
        <h2 className="font-semibold">Ask</h2>
        <div className="flex gap-3 text-sm">
          <button className="underline" onClick={() => setActive(null)} disabled={sending}>
            New chat
          </button>
          <button className="underline" onClick={() => setView("history")} disabled={sending}>
            History
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!active && !sending && (
          <div className="space-y-2 pt-6">
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Grounded in Foray's catalog, weather, and your journal. {SAFETY_DISCLAIMER}
            </p>
            {SUGGESTED.map((s) => (
              <button
                key={s}
                className="block w-full rounded border px-3 py-2 text-left text-sm"
                style={{ borderColor: "var(--line)" }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {active?.turns.map((t, i) => (
          <div key={i} className={`mb-3 ${t.role === "user" ? "text-right" : ""}`}>
            {t.role === "user" ? (
              <span className="inline-block rounded-lg px-3 py-2 text-sm" style={{ background: "var(--line)" }}>
                {t.text}
              </span>
            ) : (
              <div className="space-y-2">
                {t.cards?.map((c, ci) => <ChatCardView key={ci} card={c} />)}
                <ChatMarkdown text={t.text} />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="space-y-2">
            {streamCards.map((c, ci) => (
              <ChatCardView key={ci} card={c} />
            ))}
            {streamText && <ChatMarkdown text={streamText} />}
            {toolNote && (
              <p className="animate-pulse font-mono text-xs" style={{ color: "var(--ink-soft)" }}>
                {toolNote}
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--line)" }}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "transparent" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder={online ? "Ask about species, conditions, spots…" : "Offline — Ask needs a connection"}
          disabled={!online || sending}
        />
        {sending ? (
          <button
            type="button"
            className="rounded border px-4 text-sm"
            style={{ borderColor: "var(--line)" }}
            onClick={() => abortRef.current?.abort()}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="rounded border px-4 text-sm"
            style={{ borderColor: "var(--line)" }}
            disabled={!online || !input.trim()}
          >
            Send
          </button>
        )}
      </form>
      <ApiKeyDialog open={keyDialogOpen} onClose={() => setKeyDialogOpen(false)} />
    </div>
  );
}
