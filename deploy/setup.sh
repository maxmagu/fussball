#!/bin/bash
set -e

# ── Fussball2 VPS Setup ──
# Run once on the VPS as root:
#   ssh root@168.119.231.157 'bash -s' < deploy/setup.sh

DOMAIN="fsbl.maxapps.live"
APP_DIR="/opt/fussball2"

echo "==> Cloning repo..."
if [ ! -d "$APP_DIR/.git" ]; then
  git clone git@github.com:maxmagu/fussball.git $APP_DIR
else
  cd $APP_DIR && git pull origin main
fi

echo "==> Setting up nginx..."
cat > /etc/nginx/sites-available/fussball2 <<'NGINX'
server {
    listen 80;
    server_name fsbl.maxapps.live;

    root /opt/fussball2;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/fussball2 /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo "==> Obtaining SSL certificate..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN --redirect

echo ""
echo "============================================"
echo "  Done! https://fsbl.maxapps.live"
echo "============================================"
