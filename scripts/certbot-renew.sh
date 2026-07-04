#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Let's Encrypt renewal hook — install once at:
#   /etc/letsencrypt/renewal-hooks/deploy/certbot-renew.sh
#
# After every successful `certbot renew`, this script:
#   1. Copies fullchain.pem + privkey.pem into the Nginx bind-mount tree.
#   2. Reloads Nginx inside the running container (no downtime).
#
# Requires: docker compose stack running from /root/denfert-pizzeria.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${PIZZA_DENFERT_DIR:-/root/denfert-pizzeria}"
HOSTS=("api.pizzadenfert.fr" "loyalty.pizzadenfert.fr")

for host in "${HOSTS[@]}"; do
  src="/etc/letsencrypt/live/$host"
  dst="$REPO_DIR/nginx/certs/$host"
  [ -d "$src" ] || { echo "[cert-hook] $src not found, skipping"; continue; }
  mkdir -p "$dst"
  cp -f "$src/fullchain.pem" "$dst/fullchain.pem"
  cp -f "$src/privkey.pem"   "$dst/privkey.pem"
  chmod 644 "$dst/fullchain.pem"
  chmod 600 "$dst/privkey.pem"
done

cd "$REPO_DIR"
docker compose exec -T nginx nginx -s reload || true
echo "[cert-hook] Nginx reloaded"
