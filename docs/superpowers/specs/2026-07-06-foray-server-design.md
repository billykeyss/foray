# Foray Server — Design

**Date:** 2026-07-06
**Status:** Approved direction (maintainer); spec pending review
**Reference:** Keeper's server + deploy stack (`~/projects/fishing-law`): Hono app serving a static SPA + API, `KEEPER_PASSWORD` middleware (`src/api/auth.ts`), in-memory rate limits (`src/api/chat.ts:11-29`), tmux/launchd supervision (`scripts/keeper-tmux.sh`, `docs/deploy-mac-mini.md`).

## Goal

Run Foray as a single supervised server process on the Mac mini (keeper-style, LAN/Tailscale), with the chat gated behind a shared password and funded by a **server-held** Anthropic key that never reaches any browser. The public Render deployment keeps working unchanged (BYO-key chat) until retired.

## Architectural stance

Foray's static-export/offline-PWA build is untouched. "Server" means what it means for Keeper: a static frontend served by one API process. Next stays `output: 'export'`; the server serves `out/` and owns the secrets. The chat's agent loop stays **in the browser** (its tools need browser data: localStorage journal, location context, bundled catalog) — only the Anthropic HTTP call moves behind a proxy.

## Components

### 1. Server — `server/` (new)

Hono + `@hono/node-server` (same framework as Keeper; the only new deps). TypeScript, run directly via `node --experimental-strip-types server/index.ts` (repo convention; no tsx). Port from `PORT`, default **4245**.

Routes:

| Route | Behavior |
| --- | --- |
| `GET /api/chat/auth/check` | 503 `{error:"chat not configured"}` if `ANTHROPIC_API_KEY` or `FORAY_CHAT_PASSWORD` unset; 401 if `x-foray-password` header missing/wrong (constant-time compare via `crypto.timingSafeEqual`, mirroring Keeper's `keeperAuth`); else 204. |
| `POST /api/chat/proxy/v1/messages` | Same gate as above, then per-IP (10/min) + global (30/min) in-memory sliding-window rate limit (Keeper's constants; IP from `x-forwarded-for` → socket), then forward the JSON body to `https://api.anthropic.com/v1/messages` — **streaming the upstream response back verbatim** (SSE passthrough). Upstream headers are built fresh (never pass client headers through wholesale): server `x-api-key`, plus an allowlist copied from the client request: `anthropic-version`, `anthropic-beta`, `content-type`. Client-sent `x-api-key` (the SDK's placeholder) and `x-foray-password` are dropped. Upstream errors pass through with their status. The proxy never logs or echoes the key or request bodies. |
| everything else | Static files from `out/` — html routes resolve `<path>.html` (Next export layout: `chat.html`, `catalog/<id>.html`, …), `/` → `index.html`, unknown → `404.html`. Correct content-types; no directory traversal (normalize + prefix check). |

The path shape `/api/chat/proxy/v1/messages` exists because the Anthropic SDK appends `/v1/messages` to its `baseURL` — the client just sets `baseURL: <origin>/api/chat/proxy`.

Structure: `server/index.ts` (wiring), `server/auth.ts` (password check), `server/rate-limit.ts`, `server/proxy.ts` (upstream call with injectable `fetch` for tests), `server/static.ts`. Config read once at startup into a typed object.

### 2. Client changes (small)

- `lib/chat/agent.ts`: `runChatTurn` gains an auth union: `{kind:"byo", apiKey}` (today's path, unchanged) or `{kind:"password", password}` → SDK client constructed with `baseURL: `${location.origin}/api/chat/proxy``, a placeholder `apiKey`, and `defaultHeaders: {"x-foray-password": password}`. Everything else (loop, tools, cards, abort) identical. `web_search` server-tool requests flow through the same proxied `/v1/messages` call — no extra work.
- `lib/chat/gate.ts` (new, pure, node-testable): `probeChatProxy(fetchImpl)` → `"password-mode" | "byo-mode" | "unconfigured"` from the auth/check response (401→password-mode, 503→unconfigured (falls back to byo), 404/network→byo-mode); plus password persistence helpers under `foray.chat.password.v1`.
- `components/chat/chat-panel.tsx`: on mount, probe. Password mode → gate screen (password input; small "use your own API key instead" link to the existing dialog; wrong password → inline error from a live auth/check). Stored password reused silently; any mid-chat 401 clears it and re-locks (Keeper's rotation behavior). BYO mode → exactly today's UI.

### 3. Mac mini ops (Keeper's playbook, minus Docker/Postgres)

- `scripts/foray-server.sh` — tmux-supervised run loop adapted from `keeper-tmux.sh`: sources env from `~/.config/foray/env` (600 perms, outside the repo: `ANTHROPIC_API_KEY`, `FORAY_CHAT_PASSWORD`, `PORT`), optional `--build` (`pnpm install && pnpm build`), restarts the server on crash with backoff.
- `deploy/com.foray.server.plist` — launchd job that starts the tmux supervisor at boot (mirroring Keeper's).
- `docs/deploy-mac-mini.md` — setup guide adapted from Keeper's: prerequisites, env file, launchd install, updating (git pull → build → restart), Tailscale access notes.

### 4. Deployment matrix

| Deployment | Serves | Chat mode |
| --- | --- | --- |
| Render (public, unchanged) | static `out/` via CDN | BYO key — probe finds no proxy |
| Mac mini (tailnet) | same `out/` via Foray server | password → proxy → server key |

Retiring Render later = deleting `render.yaml`; nothing else depends on it. Exposing the mini publicly (Tailscale Funnel etc.) is out of scope.

## Security notes

- The Anthropic key exists only in the server process env; the proxy injects it upstream and never returns it. Password compare is constant-time. Rate limits bound abuse by password-holders and brute-force attempts alike (401s count toward the per-IP window).
- Threat model matches Keeper's: anyone with the password can spend the key *through the proxy* (bounded by rate limits + an Anthropic workspace spend cap — recommended), but cannot extract the key. Rotation: change env, restart; clients re-lock on 401.
- The password grants chat only; it is stored in localStorage like Keeper's (`keeper:password`) — acceptable for the friends-on-tailnet audience.

## Testing

- `scripts/server.test.mjs` (node:test, imports `server/*.ts` via strip-types): auth (missing/wrong/right password; unconfigured → 503; timing-safe path used), rate limiter (window expiry, per-IP vs global), proxy handler with an injected fake upstream fetch (key header injected; body/stream passed through; upstream 4xx/5xx passthrough; key never present in any response), static path resolution (html mapping, traversal rejected).
- `scripts/chat.test.mjs` additions: `probeChatProxy` mode mapping (204/401/503/404/network).
- Existing 98 tests unchanged. `npx tsc --noEmit` covers `server/*.ts`.
- Manual QA: run the server locally with a real key + password in env; full chat turn through the proxy; wrong-password re-lock; Render-mode regression (probe → BYO).

## Out of scope

- Converting Next to a running server; any DB; server-side agent loop; retiring Render; public exposure of the mini; syncing journal or any user data server-side.

## Dependency delta

`hono`, `@hono/node-server`.
