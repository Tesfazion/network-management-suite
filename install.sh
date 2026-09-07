#!/usr/bin/env bash
# =============================================================
#  Network Management Suite - Linux / macOS installer
#  Installs dependencies and optionally loads demonstration data.
#  Run from the project folder:  bash install.sh
# =============================================================
set -e

echo
echo "  ============================================"
echo "   Network Management Suite - installation"
echo "  ============================================"
echo

command -v node >/dev/null 2>&1 || {
  echo "  ERROR: Node.js (>= 18) was not found."
  echo "  Install it from https://nodejs.org then run this again."
  exit 1
}

echo "  [1/3] Installing dependencies (npm install)..."
npm install

echo "  [2/3] Preparing the database..."
echo "        network.db is created automatically on first run."

echo "  [3/3] Demonstration data (optional)"
read -r -p "        Load a demonstration office network? [y/N] " wantdemo
if [[ "$wantdemo" =~ ^[Yy]$ ]]; then
  npm run seed
fi

echo
echo "  ------------------------------------------------------------"
echo "   Installation complete."
echo "   - Start the Suite with:   npm start"
echo "   - Open in your browser:   http://localhost:8080"
echo "   - To reach it from other computers, share the machine's"
echo "     LAN address (the server binds 0.0.0.0 by default)."
echo "  ------------------------------------------------------------"
echo