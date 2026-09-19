#!/usr/bin/env bash
# Deploy / update production in one command, from your laptop:
#   ./deploy/deploy.sh            # full deploy (rsync → npm ci → build → pm2 reload)
#   ./deploy/deploy.sh --fast     # skip npm ci when package.json didn't change
# Requires: SSH key installed on the server (see deploy/README.md).
set -euo pipefail
HOST="${SPHYNX_HOST:-root@37.60.232.191}"
APP_DIR=/var/www/sphynx
HERE="$(cd "$(dirname "$0")/.." && pwd)"
FAST="${1:-}"

echo "▸ syncing source → $HOST:$APP_DIR"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .data --exclude .git \
  --exclude .DS_Store --exclude tsconfig.tsbuildinfo \
  --exclude 'VVVHOUND_*' \
  --exclude onchain/lib --exclude onchain/out --exclude onchain/cache --exclude onchain/broadcast --exclude onchain/.env \
  "$HERE/" "$HOST:$APP_DIR/"

echo "▸ building on server"
ssh "$HOST" bash -s "$FAST" <<'REMOTE'
set -euo pipefail
cd /var/www/sphynx
export NODE_ENV=production
if [[ "${1:-}" != "--fast" || ! -d node_modules ]]; then
  npm ci --no-audit --no-fund --include=dev
fi
npx next build
mkdir -p .data
if pm2 describe sphynx >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save >/dev/null
sleep 2
curl -s -o /dev/null -w "▸ health: HTTP %{http_code}\n" http://127.0.0.1:5190/
REMOTE
echo "✓ deployed → http://${HOST#*@}/"
