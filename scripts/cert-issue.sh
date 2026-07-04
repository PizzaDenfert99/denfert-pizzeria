#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pizza Denfert — obtain a real Let's Encrypt cert without stopping Nginx.
#
# Uses the HTTP-01 webroot method: certbot writes a challenge file to
# /var/www/certbot inside a shared Docker volume, the already-running Nginx
# serves it under /.well-known/acme-challenge/, Let's Encrypt validates, and
# certbot writes the cert into the certbot_data volume. This script then
# copies the cert into nginx/certs/<host>/ (bind-mounted into Nginx) and
# reloads Nginx — all with zero downtime.
#
# One SAN certificate covers both hostnames (Let's Encrypt allows up to 100
# per cert). Certbot names the lineage after the FIRST -d flag.
#
# Usage:
#   sudo bash scripts/cert-issue.sh you@your.email
# or:
#   sudo EMAIL=you@your.email make cert-issue
# ---------------------------------------------------------------------------
set -euo pipefail

EMAIL="${1:-${EMAIL:-}}"
[ -n "$EMAIL" ] || {
  echo "usage: $0 <email>  (or EMAIL=you@your.email make cert-issue)" >&2
  exit 2
}

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

PRIMARY="api.pizzadenfert.fr"
HOSTS="$PRIMARY loyalty.pizzadenfert.fr"

echo "==> Ensuring Nginx is running (needed for HTTP-01 challenge)"
if ! docker compose ps --status running 2>/dev/null | grep -q pizzadenfert-nginx; then
  docker compose up -d nginx
  sleep 3
fi

echo "==> Requesting Let's Encrypt cert for: $HOSTS"
CERTBOT_ARGS="certonly --webroot -w /var/www/certbot --agree-tos --no-eff-email --non-interactive -m $EMAIL --cert-name $PRIMARY"
for h in $HOSTS; do CERTBOT_ARGS="$CERTBOT_ARGS -d $h"; done
docker compose --profile cert run --rm --entrypoint certbot certbot $CERTBOT_ARGS

echo "==> Copying the issued cert into nginx/certs/<host>/ for each server block"
for host in $HOSTS; do
  mkdir -p "nginx/certs/$host"
done
# Copy the SAME lineage (one SAN cert) into both host directories.
docker compose --profile cert run --rm --entrypoint sh certbot -c "
set -eu
for host in $HOSTS; do
  cp -L /etc/letsencrypt/live/$PRIMARY/fullchain.pem /etc/letsencrypt/live-out/\$host/fullchain.pem
  cp -L /etc/letsencrypt/live/$PRIMARY/privkey.pem   /etc/letsencrypt/live-out/\$host/privkey.pem
  chmod 644 /etc/letsencrypt/live-out/\$host/fullchain.pem
  chmod 600 /etc/letsencrypt/live-out/\$host/privkey.pem
done
"

echo "==> Reloading Nginx (zero downtime)"
docker compose exec -T nginx nginx -s reload

echo "==> Done. Verify with:"
echo "    curl -fsS https://$PRIMARY/api/healthz"
