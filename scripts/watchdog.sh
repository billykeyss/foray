#!/bin/zsh
# Health watchdog for the Foray stack, run periodically by com.foray.watchdog.
# Repairs the failure modes we've actually hit on this class of hardware: the
# tmux session missing, a wedged server, or a wedged tunnel. Conservative: it
# only acts when a specific check fails, and logs every action. Mirrors the
# Sesh watchdog.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
UID_N=$(id -u)
LOG=/tmp/foray-watchdog.log
log() { printf '[watchdog %s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

# 1. tmux session hosting the server.
if ! tmux has-session -t foray 2>/dev/null; then
  log "tmux session 'foray' missing -> (re)load com.foray.server"
  launchctl kickstart -k "gui/$UID_N/com.foray.server" 2>/dev/null \
    || launchctl bootstrap "gui/$UID_N" "$HOME/Library/LaunchAgents/com.foray.server.plist" 2>/dev/null \
    || log "WARN: could not (re)start com.foray.server"
fi

# 2. local server health.
local_code=$(curl -s -o /dev/null -m 5 -w "%{http_code}" http://localhost:4245/ 2>/dev/null)
if [ "$local_code" != "200" ]; then
  log "local server unhealthy (code=$local_code) -> respawn foray tmux pane"
  tmux respawn-pane -k -t foray 2>/dev/null || log "WARN: respawn foray pane failed"
fi

# 3. Public reachability through the Cloudflare tunnel. If the site is healthy
#    locally but unreachable publicly, the tunnel (not the app) is the fault —
#    KeepAlive only restarts cloudflared on process exit, not on a wedged tunnel.
#    Retry to avoid reacting to a transient Cloudflare blip.
if [ "$local_code" = "200" ]; then
  pub_code=""
  for i in 1 2; do
    pub_code=$(curl -s -o /dev/null -m 10 -w "%{http_code}" https://foray.billhuang.me/ 2>/dev/null)
    [ "$pub_code" = "200" ] && break
    sleep 3
  done
  if [ "$pub_code" != "200" ]; then
    log "public site unreachable (code=$pub_code) but local OK -> restart tunnel"
    launchctl kickstart -k "gui/$UID_N/com.foray.tunnel" 2>/dev/null \
      || log "WARN: could not restart com.foray.tunnel"
  fi
fi

# 4. Cap log growth.
for f in /tmp/foray-tunnel.log /tmp/foray-watchdog.log /tmp/foray-autodeploy.log; do
  [ -f "$f" ] || continue
  size=$(stat -f%z "$f" 2>/dev/null || echo 0)
  if [ "$size" -gt 5242880 ]; then
    tail -c 1048576 "$f" > "$f.rot" 2>/dev/null && cat "$f.rot" > "$f" && rm -f "$f.rot"
    log "rotated $f (was ${size}B, kept last 1MB)"
  fi
done
