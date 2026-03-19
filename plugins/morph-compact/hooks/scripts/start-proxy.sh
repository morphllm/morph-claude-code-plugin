#!/usr/bin/env bash
set -e

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-.}"
PROXY_BIN="$PLUGIN_ROOT/bin/morph-proxy"
PORT=1248
PID_FILE="/tmp/morph-proxy.pid"
LOG_FILE="/tmp/morph-proxy.log"

# If proxy is already running on this port, skip
if lsof -iTCP:$PORT -sTCP:LISTEN -P -n > /dev/null 2>&1; then
  exit 0
fi

# Kill any stale proxy from a previous session
if [ -f "$PID_FILE" ]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
fi

# Start the proxy
if [ -x "$PROXY_BIN" ]; then
  PROXY_PORT="$PORT" nohup "$PROXY_BIN" > "$LOG_FILE" 2>&1 &
else
  PROXY_PORT="$PORT" nohup bun run "$PLUGIN_ROOT/src/proxy.ts" > "$LOG_FILE" 2>&1 &
fi

PROXY_PID=$!
echo "$PROXY_PID" > "$PID_FILE"

# Wait for proxy to be ready
for i in $(seq 1 40); do
  if lsof -iTCP:$PORT -sTCP:LISTEN -P -n > /dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "Proxy failed to start. Check $LOG_FILE" >&2
    exit 2
  fi
  sleep 0.25
done

if ! kill -0 "$PROXY_PID" 2>/dev/null; then
  echo "Proxy failed to start. Check $LOG_FILE" >&2
  exit 2
fi

# Set env for this session
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo "export ANTHROPIC_BASE_URL=http://localhost:$PORT" >> "$CLAUDE_ENV_FILE"
  echo "export MORPH_PROXY_PID=$PROXY_PID" >> "$CLAUDE_ENV_FILE"
fi

exit 0
