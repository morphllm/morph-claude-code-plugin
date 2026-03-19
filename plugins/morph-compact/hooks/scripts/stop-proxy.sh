#!/usr/bin/env bash

# Kill by PID file (set by start-proxy.sh via CLAUDE_ENV_FILE)
if [ -n "$MORPH_PROXY_PID_FILE" ] && [ -f "$MORPH_PROXY_PID_FILE" ]; then
  PID=$(cat "$MORPH_PROXY_PID_FILE")
  kill "$PID" 2>/dev/null || true
  rm -f "$MORPH_PROXY_PID_FILE"
elif [ -n "$MORPH_PROXY_PID" ]; then
  kill "$MORPH_PROXY_PID" 2>/dev/null || true
fi

exit 0
