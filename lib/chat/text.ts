/** Pure text helpers for the chat renderer. No React, no DOM. */

export function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

export type InlinePart =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "species"; id: string };

// Order matters: species token, markdown link, bold.
const TOKEN = /\[\[species:([a-z0-9-]+)\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: "text", text: text.slice(last, idx) });
    if (m[1]) {
      parts.push({ kind: "species", id: m[1] });
    } else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      if (href) parts.push({ kind: "link", text: m[2], href });
      else parts.push({ kind: "text", text: m[2] }); // unsafe URL → text only
    } else if (m[4] !== undefined) {
      parts.push({ kind: "bold", text: m[4] });
    }
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
