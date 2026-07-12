# Deploying Foray to a home Mac mini

Run Foray as an always-on service on a Mac mini on your home network: the Foray
server (a single Hono process) serves the static export and the password-gated
chat proxy, running as a macOS `launchd` service that starts at boot and
restarts on crash, reachable from any phone/laptop on your Wi-Fi (and,
optionally, from anywhere via Tailscale). See
[`deployment.md`](./deployment.md) for how this deployment relates to the
public Render site — same codebase, same static export, different chat mode.

There is no database and no Docker here. Foray is a static-export PWA; the
server's only job is to serve `out/` and hold the Anthropic key server-side so
the chat can run password-gated instead of bring-your-own-key.

## 1. Prerequisites (one-time)

On the Mac mini:

1. **Node.js 22.6 or newer** — `brew install node`, then check with `node
   --version`. This is a hard requirement, not just a recommendation: the
   server runs directly from TypeScript via `node --experimental-strip-types
   server/index.ts` (no build step, no `tsx`), and that flag doesn't exist on
   older Node. The supervisor script resolves `node` from the PATH at launch
   and falls back to Homebrew paths; if you use a version manager
   (nvm/volta/asdf), either `brew install node` for the service account or add
   your node's bin directory to the plist's PATH so launchd can find it at
   boot.
2. **pnpm**, via corepack (ships with Node) — `corepack enable` makes `pnpm`
   resolve to the version pinned by the repo's `pnpm-lock.yaml`. Don't
   `brew install pnpm` separately; a mismatched global pnpm can produce a
   different lockfile resolution than CI/Render use.
3. **tmux** — `brew install tmux`. This is what keeps the server running
   detached from any login session and gives you a way to attach and watch
   logs live.
4. **Git** — `xcode-select --install` if not already present.
5. macOS **System Settings → Energy → Prevent automatic sleeping when the
   display is off: ON** (a sleeping mini serves nothing). Also enable
   **Start up automatically after a power failure**.
6. Optional but recommended: **System Settings → Users & Groups → automatic
   login** for the account that will run the service, so the LaunchAgent
   below can come up without anyone entering a password after a reboot.

## 2. Install Foray

```bash
git clone git@github.com:billykeyss/mushroom-rain-tracker.git ~/foray
cd ~/foray
corepack enable
pnpm install
pnpm build
```

`pnpm build` runs `next build --no-lint` followed by the service worker build
(`scripts/build-sw.mjs`) and produces the static export in `~/foray/out` —
this is exactly what Render publishes, and it's what the Foray server serves
directly off disk. There's no separate "web build" step and no database to
migrate or seed; the entire species catalog, forecast logic, and image maps
are compiled into the bundle.

Sanity check before wiring up the service: `pnpm test` should be all green.

## 3. Secrets

The server reads two secrets from the environment: `ANTHROPIC_API_KEY` (a
key with its own workspace, ideally — see the spend-cap note below) and
`FORAY_CHAT_PASSWORD` (the shared password visitors on your tailnet type once
to unlock chat). Both live outside the repo, in a file only the mini reads:

```bash
mkdir -p ~/.config/foray
cat > ~/.config/foray/env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
FORAY_CHAT_PASSWORD=choose-a-real-password
EOF
chmod 600 ~/.config/foray/env
```

`chmod 600` matters — this file holds a live API key. `scripts/foray-server.sh`
sources it into the server's environment each time the supervisor loop starts
the process; it is never read by the plist and never committed. If either
variable is missing, the server still starts (it always serves the static
site), but `/api/chat/auth/check` returns 503 and every client falls back to
bring-your-own-key mode automatically — there's no failure mode where the
site goes down because a secret is missing.

## 4. Run Foray as a launchd service inside a tmux session

At login/boot, launchd runs `scripts/foray-server.sh`, which starts a detached
**tmux** session named `foray` containing a supervisor loop that runs
`node --experimental-strip-types server/index.ts` and auto-restarts it if it
crashes. You get boot-start *and* a live console you can attach to anytime —
this mirrors how Keeper is run on the same class of hardware.

> Why not `KeepAlive`? tmux daemonizes, so the launchd job exits as soon as
> the session is up — `KeepAlive` would relaunch a whole new tmux session in
> a loop instead of just the server. Instead the plist uses `RunAtLoad` +
> `AbandonProcessGroup` (so launchd doesn't reap the detached tmux server when
> its direct child exits), and crash-restarts happen inside the tmux pane, in
> `foray-server.sh`'s own `--serve` loop.

Copy the plist template out of the repo and fill in your actual home
directory (the plist can't use `$HOME` — launchd expands nothing):

```bash
mkdir -p ~/Library/LaunchAgents ~/foray/logs
sed "s#/Users/REPLACE_ME#$HOME#g" ~/foray/deploy/com.foray.server.plist \
  > ~/Library/LaunchAgents/com.foray.server.plist
launchctl load ~/Library/LaunchAgents/com.foray.server.plist
```

Verify:

```bash
tmux ls                                                          # → foray: 1 windows ...
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4245/   # → 200
tmux attach -t foray                                              # live server logs; detach: Ctrl-b then d
```

The startup log line tells you whether chat is configured:
`[foray] serving <out-dir> on :4245 — password-gated chat ON` (or `chat NOT
configured (503)` if the env file is missing or incomplete).

Day-to-day management (the tmux session, not launchd, is the thing that
actually runs the process):

```bash
tmux attach -t foray                 # watch logs / interact (detach with Ctrl-b d — do NOT Ctrl-C unless stopping)
tmux kill-session -t foray           # stop the server + supervisor
~/foray/scripts/foray-server.sh      # start it again by hand (idempotent — no-op if already running)
launchctl kickstart gui/$(id -u)/com.foray.server   # same as running the script, via launchd
```

The supervisor restarts the server ~3s after any crash. Killing just the
`node` process does NOT stop Foray — the supervisor will bring it right back;
use `tmux kill-session -t foray` when you actually want it down.

## 5. Reach it from your phone

- **On your home Wi-Fi:** macOS advertises the mini over Bonjour, so
  **`http://<mini-hostname>.local:4245`** works from iPhones/Macs (find/set
  the hostname in System Settings → General → Sharing → Local hostname —
  e.g. `foray-mini.local`). Android sometimes lacks mDNS; use the raw IP
  instead (`ipconfig getifaddr en0` on the mini), and give the mini a **DHCP
  reservation** in your router so the IP doesn't drift.
- **Away from home (recommended): [Tailscale](https://tailscale.com)** —
  install on the mini and your phone, sign in to the same tailnet, then
  `http://<mini-tailscale-name>:4245` works from anywhere, encrypted, with
  zero router changes.
- **Do NOT port-forward** port 4245 on your router. The static catalog is
  harmless to expose, but the chat proxy is funded by your Anthropic key —
  the password gate is a reasonable bar for friends-and-family on a tailnet,
  not a defense against the open internet.

Add to Home Screen (iOS Safari: Share → Add to Home Screen) for an app-like
launcher — Foray is a PWA, so this also picks up the offline download feature
in Settings.

## 6. Updating to a new version

```bash
cd ~/foray
git pull
pnpm install                                          # in case deps changed
pnpm build                                            # rebuild out/ + the service worker
tmux kill-session -t foray && scripts/foray-server.sh  # restart the server session
```

There's no migration step and nothing to reseed — the entire catalog and
forecast logic ship inside `out/`, so a fresh `pnpm build` is the whole
update. Rotating either secret (a new password, a new key) is the same
restart: edit `~/.config/foray/env`, then `tmux kill-session -t foray &&
scripts/foray-server.sh`. Clients holding the old password get a 401 on their
next chat request and are dropped back to the unlock screen automatically —
there's no need to notify anyone out of band.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `tmux ls` shows no `foray` session after boot | Run `~/foray/scripts/foray-server.sh` by hand and read its output; check `~/foray/logs/launchd.err` (usually a PATH problem — tmux/node not found by launchd, or Node is older than 22.6). |
| `EADDRINUSE` repeating in the tmux pane | Another process owns port 4245 — change `PORT` (edit `~/.config/foray/env` if you want it fixed permanently, or export it before running the script by hand) AND restart: `tmux kill-session -t foray && launchctl kickstart gui/$(id -u)/com.foray.server`. |
| Server keeps restarting every 3s | Attach (`tmux attach -t foray`) and read the crash output — a syntax/type error surfaced by `--experimental-strip-types` is the most common cause after a bad `git pull`. |
| `/api/chat/auth/check` always 503 | `~/.config/foray/env` is missing, unreadable, or missing one of the two variables — re-check step 3 and restart. |
| Chat says "wrong password" for a password you just set | The server needs a restart to pick up an edited env file — `tmux kill-session -t foray && scripts/foray-server.sh`. |
| Blank page or stale content at `/` | `out/` is missing or stale — run `pnpm build` and restart. |
| Works on the mini, not on the phone | Same Wi-Fi? macOS firewall prompt denied incoming connections for `node`? (System Settings → Network → Firewall.) Android + `.local` name? Use the IP instead. |
| After macOS reboot nothing runs | The LaunchAgent runs at *login*, not before — make sure automatic login is enabled for the account that owns `~/Library/LaunchAgents/com.foray.server.plist` (see §1.6). |

## Notes

- The server serves both the static site and the chat proxy from one
  process/port — nothing else to run, no reverse proxy needed.
- Set a **spend cap on the Anthropic workspace** backing
  `ANTHROPIC_API_KEY` (Anthropic Console → workspace settings). The server's
  rate limiter (10 requests/min per IP, 30/min globally, applied before the
  password check so failed guesses count too) bounds abuse from a leaked
  password; the spend cap is what actually bounds the bill if that happens.
- The chat password is not a secret in the cryptographic sense — it's a
  shared "friends and family" gate, compared with `crypto.timingSafeEqual`
  to avoid timing side-channels, not to resist a determined attacker with
  network access. Tailscale (not the password) is what keeps this off the
  open internet.
