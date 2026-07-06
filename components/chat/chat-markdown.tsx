"use client";

import Link from "next/link";
import { parseInline } from "@/lib/chat/text.ts";
import { speciesRoute } from "@/lib/chat/species-route.ts";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) => {
        if (p.kind === "bold") return <strong key={i}>{p.text}</strong>;
        if (p.kind === "link")
          return (
            <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--rust)" }}>
              {p.text}
            </a>
          );
        if (p.kind === "species") {
          const route = speciesRoute(p.id);
          if (!route) return null; // invented/unknown id → render nothing
          return (
            <Link
              key={i}
              href={route.href}
              className="mx-0.5 inline-block rounded-full border px-2 py-0.5 font-mono text-[11px]"
              style={{ borderColor: "var(--line)", color: "var(--rust)" }}
            >
              {route.label} ↗
            </Link>
          );
        }
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

/** Minimal, safe markdown: paragraphs, bullets, ###-headings. No innerHTML. */
export default function ChatMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l) || l.trim() === "");
        if (isList) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines
                .filter((l) => l.trim())
                .map((l, li) => (
                  <li key={li}>
                    <Inline text={l.replace(/^\s*[-*]\s+/, "")} />
                  </li>
                ))}
            </ul>
          );
        }
        const h = block.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
          return (
            <p key={bi} className="pt-1 font-semibold">
              <Inline text={h[2]} />
            </p>
          );
        }
        return (
          <p key={bi}>
            <Inline text={block} />
          </p>
        );
      })}
    </div>
  );
}
