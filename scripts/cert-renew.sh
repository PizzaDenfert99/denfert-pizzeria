#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pizza Denfert — Let's Encrypt renewal (webroot method, zero downtime).
#
# certbot renew consults the lineage config it saved during issue-time and
# re-runs the same challenge type (HTTP-01 webroot in our case). After a
# successful renewal we copy the new cert into nginx/certs/<host>/ and
# reload Nginx.
#
# Suggested cron (twice-daily is Let's Encrypt-recommended):
#   0 3,15 * * *  cd /root/denfert-pizzeria && sudo bash scripts/cert-renew.sh >> /var/log/pizzadenfert-cert.log 2>&1
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

PRIMARY="api.pizzadenfert.fr"
HOSTS="$PRIMARY loyalty.pizzadenfert.fr"

echo "==> Running certbot renew"
docker compose --profile cert run --rm --entrypoint certbot certbot \
  renew --webroot -w /var/www/certbot --non-interactive

echo "==> Copying renewed cert into nginx/certs/<host>/"
for host in $HOSTS; do mkdir -p "nginx/certs/$host"; done
docker compose --profile cert run --rm --entrypoint sh certbot -c "
set -eu
for host in $HOSTS; do
  cp -L /etc/letsencrypt/live/$PRIMARY/fullchain.pem /etc/letsencrypt/live-out/\$host/fullchain.pem
  cp -L /etc/letsencrypt/live/$PRIMARY/privkey.pem   /etc/letsencrypt/live-out/\$host/privkey.pem
done
"

echo "==> Reloading Nginx (zero downtime)"
docker compose exec -T nginx nginx -s reload
echo "==> Renewal complete"
