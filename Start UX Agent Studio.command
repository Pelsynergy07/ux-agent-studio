#!/bin/bash
# Double-click to start UX Agent Studio on a Mac.
cd "$(dirname "$0")" || exit 1

# Apps started from Finder don't always see Node from Homebrew or nvm.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  UX Agent Studio needs Node.js, which isn't installed yet."
  echo "  The download page is opening: install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"
  echo
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi

node scripts/launch.mjs || { echo; read -n 1 -s -r -p "  Press any key to close."; }
