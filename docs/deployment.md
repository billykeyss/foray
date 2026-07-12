# Foray Deployment

Foray ships from one codebase to two deployments. Both serve the same static
export (`out/`, built by `pnpm build`); they differ in who holds secrets and
which chat mode users get. The chat picks its mode at runtime by probing
`/api/chat/auth/check` — no build flags.

| | Render (public) | Mac mini (private) |
| --- | --- | --- |
| URL | https://foray.billhuang.me | `http://<mini>:4245` (LAN / Tailscale) |
| Serves | `out/` via Render's static CDN | `out/` via the Foray server (`server/index.ts`) |
| Chat mode | Bring-your-own-key (key in the visitor's browser only) | Password-gated proxy (server-held Anthropic key; key never reaches browsers) |
| Secrets | none | `~/.config/foray/env` (chmod 600): `ANTHROPIC_API_KEY`, `FORAY_CHAT_PASSWORD` |
| Deploys when | push to `main` (`render.yaml`, `autoDeploy: true`; PR previews enabled) | manual: `git pull && pnpm install && pnpm build`, restart the service |

## Render (public site)

- `render.yaml` builds with **pnpm** (corepack + `pnpm-lock.yaml`) and publishes `out/`.
- **Pushing `main` deploys production.** Run `npm test` and `pnpm build` locally first.
- There is no server here: the chat probe 404s, so the chat falls back to
  BYO-key mode automatically. Nothing on Render needs configuration.
- Retiring Render = delete `render.yaml`; nothing else depends on it.

## Mac mini (Foray server)

One supervised process (Keeper-style): a Hono app that serves `out/` and hosts
the password-gated streaming proxy to `api.anthropic.com`. Full setup —
prerequisites, env file, tmux supervisor, launchd — lives in
[`deploy-mac-mini.md`](./deploy-mac-mini.md).

Day-to-day:

```bash
# update
cd ~/foray && git pull && pnpm install && pnpm build
tmux kill-session -t foray && scripts/foray-server.sh

# watch logs            tmux attach -t foray     (detach: Ctrl-b d)
# rotate the password   edit ~/.config/foray/env, restart; clients re-lock on their next 401
# rotate the API key    same file, same restart
```

Recommended: set a **workspace spend cap** in the Anthropic console for the
server key — the rate limiter (10 req/min/IP, 30 global) bounds abuse, the cap
bounds the bill.

## Photos (both deployments)

Photos are not in git and not part of either deploy. They live in the public
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
4. Push `main` → Render deploys itself. Mini: pull/build/restart per above.
