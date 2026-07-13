#!/usr/bin/env bash
# autodeploy.sh — rebuild + restart Foray when the committed code changes.
#
# Polled by launchd (com.foray.autodeploy, StartInterval). Each tick:
#   1. fetch origin; fast-forward main IF the tree is clean and on main
#      (never clobbers local edits / diverged history)
#   2. if HEAD moved since the last successful deploy -> install, build, restart
#   3. health-check; only record the new SHA (forward-only) if it comes up green
# Mirrors tahoe-sno's autodeploy.sh. Keys off the COMMITTED HEAD — uncommitted
# edits won't deploy until you commit them.
set -euo pipefail

REPO="$HOME/projects/foray"
PORT="${PORT:-4245}"
STATE="$REPO/scripts/.autodeploy_sha"
cd "$REPO"

log() { echo "[$(date '+%F %T')] $*"; }

# launchd provides a minimal PATH. Prepend Homebrew and the directory of the
# node currently on PATH (covers nvm/volta/asdf installs, not just Homebrew).
NODE_DIR="$(command -v node 2>/dev/null | xargs -r dirname || true)"
export PATH="${NODE_DIR:+$NODE_DIR:}/opt/homebrew/bin:/usr/local/bin:$PATH"

git fetch --quiet origin 2>/dev/null || { log "fetch failed (offline?) — skipping"; exit 0; }

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ -z "$(git status --porcelain)" ] && [ "$branch" = "main" ]; then
  git merge --ff-only --quiet origin/main 2>/dev/null || log "origin/main not fast-forwardable — leaving local HEAD"
fi

cur="$(git rev-parse HEAD)"
last="$(cat "$STATE" 2>/dev/null || true)"
[ "$cur" = "$last" ] && exit 0   # nothing new

log "deploying $cur (was ${last:-none})"
if ! pnpm install --frozen-lockfile >/tmp/foray-autodeploy-install.log 2>&1; then
  log "pnpm install FAILED — see /tmp/foray-autodeploy-install.log; not restarting"; exit 1
fi
if ! pnpm build >/tmp/foray-autodeploy-build.log 2>&1; then
  log "BUILD FAILED — see /tmp/foray-autodeploy-build.log; keeping previous build, not restarting"; exit 1
fi

# foray-server.sh is a no-op if the tmux session is already up, so kill it
# first to force the supervisor loop to pick up the new build.
tmux kill-session -t foray 2>/dev/null || true
"$REPO/scripts/foray-server.sh"

for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:$PORT/" >/dev/null 2>&1; then
    echo "$cur" > "$STATE"
    log "deployed $cur OK"
    exit 0
  fi
  sleep 1
done
log "HEALTH CHECK FAILED after deploying $cur — left running, NOT recording SHA (will retry next tick)"
exit 1
