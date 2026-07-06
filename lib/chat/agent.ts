/**
 * Browser-side streaming tool-use loop. The ONLY chat module that imports
 * @anthropic-ai/sdk — node tests must not import this file.
 *
 * The user's key never leaves the browser: same trust model as spot-finder,
 * via anthropic-dangerous-direct-browser-access (dangerouslyAllowBrowser).
 */
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type ChatContext } from "./prompt.ts";
import {
  TOOL_SCHEMAS,
  WEB_SEARCH_TOOL,
  executeTool,
  type ToolCard,
  type ToolContext,
} from "./tools.ts";
import { safeHref } from "./text.ts";

export const CHAT_MODEL = "claude-sonnet-5";
export const MAX_TOOL_TURNS = 8;

export interface RunCallbacks {
  onTextDelta: (delta: string) => void;
  onToolNote: (toolName: string) => void;
  onCard: (card: ToolCard) => void;
}

export interface RunResult {
  text: string;
  stopReason: string | null;
  /** true when the loop hit MAX_TOOL_TURNS before end_turn */
  exhausted: boolean;
}

interface WebResult {
  title: string;
  url: string;
}

/** Pull sanitized results out of server-side web_search result blocks. */
function extractWebResults(content: Anthropic.ContentBlock[]): WebResult[] {
  const out: WebResult[] = [];
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    const items = (block as { content?: unknown }).content;
    if (!Array.isArray(items)) continue; // error object, not results
    for (const item of items as { type?: string; url?: string; title?: string }[]) {
      if (item.type !== "web_search_result") continue;
      const href = typeof item.url === "string" ? safeHref(item.url) : null;
      if (href) out.push({ title: item.title ?? href, url: href });
    }
  }
  return out;
}

export async function runChatTurn(opts: {
  apiKey: string;
  /** Full conversation for this request, ending with the new user message. */
  messages: Anthropic.MessageParam[];
  context: ChatContext;
  toolContext: ToolContext;
  signal: AbortSignal;
  callbacks: RunCallbacks;
}): Promise<RunResult> {
  const { apiKey, messages, context, toolContext, signal, callbacks } = opts;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const { staticText, dynamicText } = buildSystemPrompt(context);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: staticText, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicText },
  ];
  const tools = [
    ...TOOL_SCHEMAS,
    WEB_SEARCH_TOOL,
  ] as Anthropic.Messages.ToolUnion[];

  let text = "";
  let stopReason: string | null = null;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const stream = client.messages.stream(
      {
        model: CHAT_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system,
        tools,
        messages,
      },
      { signal }
    );
    stream.on("text", (delta) => {
      text += delta;
      callbacks.onTextDelta(delta);
    });

    const msg = await stream.finalMessage();
    stopReason = msg.stop_reason;
    messages.push({ role: "assistant", content: msg.content });

    const webResults = extractWebResults(msg.content);
    if (webResults.length > 0) {
      callbacks.onCard({ tool: "web_search", data: webResults });
    }

    if (msg.stop_reason === "pause_turn") continue; // server tool resumes

    if (msg.stop_reason !== "tool_use") {
      return { text, stopReason, exhausted: false };
    }

    const toolUses = msg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    for (const t of toolUses) callbacks.onToolNote(t.name);

    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (t) => {
        try {
          const out = await executeTool(
            t.name,
            (t.input ?? {}) as Record<string, unknown>,
            toolContext,
            callbacks.onCard
          );
          return { type: "tool_result" as const, tool_use_id: t.id, content: out };
        } catch (err) {
          return {
            type: "tool_result" as const,
            tool_use_id: t.id,
            content: err instanceof Error ? err.message : "tool failed",
            is_error: true,
          };
        }
      })
    );
    messages.push({ role: "user", content: results });
  }

  return { text, stopReason, exhausted: true };
}
