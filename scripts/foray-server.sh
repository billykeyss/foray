#!/usr/bin/env bash
# Start (or reuse) a detached tmux session running the Foray server.
#
# Launched by launchd at login (see docs/deploy-mac-mini.md): tmux daemonizes and
# this script exits immediately, so the launchd job uses RunAtLoad +
# AbandonProcessGroup — NOT KeepAlive. Crash-restarts happen in the --serve loop
# inside the tmux pane.
#
#   Attach to watch logs:  tmux attach -t foray   (detach: Ctrl-b then d)
#   Stop the server:       tmux kill-session -t foray
#
# Crash-restarts happen in the --serve loop inside the tmux pane; the loop
# process stays named foray-server.sh, so killing the node server never kills
# the supervisor.
#
# Env: PORT (default 4245), FORAY_TMUX_SESSION (default "foray").
# Secrets (ANTHROPIC_API_KEY, FORAY_CHAT_PASSWORD) live in ~/.config/foray/env
# (chmod 600), sourced inside the pane.
set -euo pipefail

SESSION="${FORAY_TMUX_SESSION:-foray}"
PORT="${PORT:-4245}"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# launchd provides a minimal PATH. Prepend Homebrew and the directory of the
# node currently on PATH (covers nvm/volta/asdf installs, not just Homebrew).
NODE_DIR="$(command -v node 2>/dev/null | xargs -r dirname || true)"
export PATH="${NODE_DIR:+$NODE_DIR:}/opt/homebrew/bin:/usr/local/bin:$PATH"

if [[ "${1:-}" == "--serve" ]]; then
  # Supervisor loop, running inside the tmux pane.
  cd "$DIR"
  ENV_FILE="$HOME/.config/foray/env"
  set -a
  [ -f "$ENV_FILE" ] && . "$ENV_FILE"
  set +a
  while true; do
    PORT="$PORT" node --experimental-strip-types server/index.ts && rc=0 || rc=$?
    echo "[foray] server exited (code $rc) — restarting in 3s (Ctrl-C twice to stop)"
    sleep 3
  done
fi

if ! command -v tmux >/dev/null; then
  echo "foray-server: tmux not found (brew install tmux)" >&2
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "foray-server: session '$SESSION' already running (tmux attach -t $SESSION)"
  exit 0
fi

tmux new-session -d -s "$SESSION" -c "$DIR" \
  "PORT=$PORT FORAY_TMUX_SESSION=$SESSION '$SCRIPT' --serve"

echo "foray-server: started session '$SESSION' serving on port $PORT (tmux attach -t $SESSION)"
