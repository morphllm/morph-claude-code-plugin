#!/usr/bin/env bash
set -e

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-.}"
PROXY_BIN="$PLUGIN_ROOT/bin/morph-proxy"
PID_FILE="/tmp/morph-proxy-$$.pid"
LOG_FILE="/tmp/morph-proxy-$$.log"

# Find a free port
find_free_port() {
  python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()" 2>/dev/null \
    || ruby -e "require 'socket'; s=TCPServer.new('127.0.0.1',0); puts s.addr[1]; s.close" 2>/dev/null \
    || echo 4800
}

PORT=$(find_free_port)

# Start the proxy
if [ -x "$PROXY_BIN" ]; then
  # Compiled binary
  PROXY_PORT="$PORT" nohup "$PROXY_BIN" > "$LOG_FILE" 2>&1 &
else
  # Fallback to bun (development)
  PROXY_PORT="$PORT" nohup bun run "$PLUGIN_ROOT/src/proxy.ts" > "$LOG_FILE" 2>&1 &
fi

PROXY_PID=$!
echo "$PROXY_PID" > "$PID_FILE"

# Wait for proxy to be ready (poll the port)
for i in $(seq 1 40); do
  if lsof -iTCP:"$PORT" -sTCP:LISTEN -P -n > /dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "Proxy process died during startup. Check $LOG_FILE" >&2
    exit 2
  fi
  sleep 0.25
done

# Verify it's actually running
if ! kill -0 "$PROXY_PID" 2>/dev/null; then
  echo "Proxy failed to start. Check $LOG_FILE" >&2
  exit 2
fi

# Set ANTHROPIC_BASE_URL for this session
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo "export ANTHROPIC_BASE_URL=http://localhost:$PORT" >> "$CLAUDE_ENV_FILE"
  echo "export MORPH_PROXY_PID=$PROXY_PID" >> "$CLAUDE_ENV_FILE"
  echo "export MORPH_PROXY_PID_FILE=$PID_FILE" >> "$CLAUDE_ENV_FILE"
  echo "export MORPH_PROXY_PORT=$PORT" >> "$CLAUDE_ENV_FILE"
fi

exit 0
