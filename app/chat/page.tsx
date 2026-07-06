import type { Metadata } from "next";
import ChatPanel from "@/components/chat/chat-panel";

export const metadata: Metadata = {
  title: "Ask — Foray",
  description: "Chat with a field-guide assistant grounded in Foray's catalog.",
};

// The root layout wraps every page in a `min-h-screen pb-24 lg:pb-0` box that
// reserves room below content for the fixed mobile TabBar (and none on lg,
// where SideNav replaces it) — see app/layout.tsx. Chat needs a real bounded
// height (not just min-height) so its own message list scrolls internally
// and the composer stays put, so this page cancels that reserved space out
// of its own height rather than letting the page grow taller than the
// viewport. `pt-14` mirrors journal/page.tsx's clearance for the fixed
// mobile TopBar; lg has no fixed top bar so only a small breathing-room
// padding is used instead.
export default function ChatPage() {
  return (
    <main className="mx-auto flex h-[calc(100dvh-96px)] max-w-[720px] flex-col pt-14 lg:h-dvh lg:pt-6">
      <ChatPanel />
    </main>
  );
}
