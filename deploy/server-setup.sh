#!/usr/bin/env bash
# One-time server bootstrap for SPHYNX (Ubuntu/Debian). Run ON THE SERVER as root:
#   bash server-setup.sh
set -euo pipefail
APP_DIR=/var/www/sphynx
PORT=5190

apt-get update -y
apt-get install -y curl git nginx rsync ufw

# Node 20 LTS via NodeSource
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2 >/dev/null

mkdir -p "$APP_DIR"

# Nginx reverse proxy :80 → :5190 (add a domain + certbot later)
cat > /etc/nginx/sites-available/sphynx <<NGX
server {
    listen 80 default_server;
    server_name sphynxagent.xyz www.sphynxagent.xyz;
    client_max_body_size 8m;
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 90s;
    }
    location /_next/static/ {
        proxy_pass http://127.0.0.1:${PORT};
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
NGX
ln -sf /etc/nginx/sites-available/sphynx /etc/nginx/sites-enabled/sphynx
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx

# firewall: ssh + http/https only
ufw allow OpenSSH >/dev/null; ufw allow 80 >/dev/null; ufw allow 443 >/dev/null; ufw --force enable >/dev/null

# pm2 boots on restart
pm2 startup systemd -u root --hp /root >/dev/null || true
echo "✓ server ready — now run ./deploy/deploy.sh from your laptop"
