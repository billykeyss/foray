# Foray Deployment

Foray now ships from one codebase to a single deployment: the Mac mini. Render
was retired (`render.yaml` deleted; nothing else depended on it) once the mini
took over public traffic for `foray.billhuang.me` and `mushroom.billhuang.me`
via a dedicated Cloudflare Tunnel — the same pattern used for
`sno.billhuang.me`/`sesh.billhuang.me` on this machine.

| | Mac mini |
| --- | --- |
| URL | https://foray.billhuang.me, https://mushroom.billhuang.me (public, via Cloudflare Tunnel `foray`) — also reachable on LAN/Tailscale at `http://<mini>:4245` |
| Serves | `out/` via the Foray server (`server/index.ts`) |
| Chat mode | Password-gated proxy (server-held Anthropic key; key never reaches browsers) |
| Secrets | `~/.config/foray/env` (chmod 600): `ANTHROPIC_API_KEY`, `FORAY_CHAT_PASSWORD` |
| Deploys when | `com.foray.autodeploy` polls `origin/main` every 60s and rebuilds+restarts on change |

## Mac mini (Foray server)

One supervised process (Keeper-style): a Hono app that serves `out/` and hosts
the password-gated streaming proxy to `api.anthropic.com`. Full setup —
prerequisites, env file, tmux supervisor, launchd — lives in
[`deploy-mac-mini.md`](./deploy-mac-mini.md).

Four launchd agents run this stack:

- `com.foray.server` — RunAtLoad, hosts the app in tmux session `foray` on `:4245`.
- `com.foray.tunnel` — RunAtLoad + KeepAlive, runs `cloudflared tunnel run` with a
  dedicated token (`~/.cloudflared/foray.token`), exposing `foray.billhuang.me`
  and `mushroom.billhuang.me` publicly without any router port-forward.
- `com.foray.autodeploy` — polls `origin/main` every 60s; on a new commit, runs
  `pnpm install && pnpm build`, restarts the tmux session, and only records the
  deployed SHA once a health check passes (`scripts/autodeploy.sh`).
- `com.foray.watchdog` — every 120s, repairs a missing tmux session, a wedged
  local server, or a wedged tunnel (`scripts/watchdog.sh`).

Day-to-day:

```bash
# update (automatic via com.foray.autodeploy; manual if you want it now)
cd ~/projects/foray && git pull && pnpm install && pnpm build
tmux kill-session -t foray && scripts/foray-server.sh

# watch logs            tmux attach -t foray     (detach: Ctrl-b d)
# rotate the password   edit ~/.config/foray/env, restart; clients re-lock on their next 401
# rotate the API key    same file, same restart
```

**Security note:** unlike the original Tailscale-only design in
[`deploy-mac-mini.md`](./deploy-mac-mini.md), the Cloudflare Tunnel exposes the
chat proxy to the open internet, not just the tailnet — the password gate and
rate limiter (10 req/min/IP, 30 global) are the only things standing between a
leaked password and your Anthropic bill. Set a **workspace spend cap** in the
Anthropic console for the server key; the rate limiter bounds abuse, the cap
bounds the damage if it's ever bypassed.

## Photos

Photos are not in git and not part of the deploy. They live in the public
GCS bucket `gs://foray-field-guide/img`, referenced by generated URL maps in
`lib/local-images.ts`.

```bash
npm run localize:images   # rewrite remote URLs → GCS URLs (updates lib/local-images.ts)
npm run sync:images       # rsync .image-staging → GCS (personal gcloud account)
npm run check:images      # report catalog images that 404
```

Image sync is independent of site deploys — run it whenever the catalog's
images change, before pushing the regenerated `.ts` maps.

## Where secrets live (and don't)

| Secret | Location | Never |
| --- | --- | --- |
| Server Anthropic key | Mac mini `~/.config/foray/env` | in git, in the bundle, in any browser |
| Chat password | Mac mini env file; visitors' localStorage (`foray.chat.password.v1`) after unlock | in git |
| BYO Anthropic keys | each visitor's own localStorage (`foray.anthropic-key.v1`) | anywhere server-side |

## Pre-deploy checklist

1. `npm test` — all suites green.
2. `npx tsc --noEmit` — clean.
3. `pnpm build` — static export + service worker build succeed.
4. Push `main` → `com.foray.autodeploy` picks it up within 60s, or run the
   manual update steps above.
