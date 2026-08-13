#!/bin/zsh

set -e
cd "${0:A:h}"

if ! command -v npm >/dev/null 2>&1; then
  echo "MacFetch needs Node.js 22 or newer. Install it from https://nodejs.org"
  read "?Press Return to close…"
  exit 1
fi

if ! command -v yt-dlp >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "MacFetch needs Homebrew, yt-dlp, and FFmpeg."
    echo "Install Homebrew from https://brew.sh, then run: brew install yt-dlp ffmpeg"
    read "?Press Return to close…"
    exit 1
  fi
  brew install yt-dlp ffmpeg
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

python3 macfetch_server.py &
service_pid=$!
MACFETCH_SERVICE_TOKEN="macfetch-dev-only" PORT=9432 python3 services/ios-api/server.py &
ios_service_pid=$!
npm run dev &
web_pid=$!

cleanup() {
  kill "$service_pid" "$ios_service_pid" "$web_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 2
open "http://localhost:3000"
echo ""
echo "MacFetch is running. Keep this window open."
echo "Downloads will be saved to the folder shown in MacFetch."
lan_ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -n "$lan_ip" ]]; then
  echo "iPhone preview: http://$lan_ip:3000/ios"
fi
echo "Press Control-C to stop."
wait
