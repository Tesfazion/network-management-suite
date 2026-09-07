#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=============================================="
echo "  Network Management Suite - Linux install"
echo "=============================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found."
  echo "  Install it with your package manager, e.g.:"
  echo "    sudo apt install nodejs npm"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install --omit=dev
else
  echo "Dependencies already installed."
fi

PORT="${PORT:-8080}"
echo
echo "Starting Network Management Suite on port $PORT..."
echo "  Local:  http://localhost:$PORT"
echo "  LAN:    http://<this-computer-ip>:$PORT"
echo
echo "For a permanent background service see deploy/nms.service"
nohup node server/server.js > nms.log 2>&1 &
echo "Started (PID $!)."
echo "Logs: nms.log"