#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pizza Denfert — Let's Encrypt renewal (webroot method, zero downtime).
#
# certbot renew consults every lineage config saved during issue-time and
# re-runs the same challenge type (HTTP-01 webroot in our case). After a
# successful renewal we copy the new certs into nginx/certs/<host>/ for BOTH
# lineages (customer web + backend hosts) and reload Nginx.
#
# Suggested cron (twice-daily is Let's Encrypt-recommended):
#   0 3,15 * * *  cd /root/denfert-pizzeria && sudo bash scripts/cert-renew.sh >> /var/log/pizzadenfert-cert.log 2>&1
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

CERT_SPECS=(
  "pizzadenfert.fr pizzadenfert.fr www.pizzadenfert.fr"
  "api.pizzadenfert.fr api.pizzadenfert.fr loyalty.pizzadenfert.fr"
)

echo "==> Running certbot renew"
docker compose --profile cert run --rm --entrypoint certbot certbot \
  renew --webroot -w /var/www/certbot --non-interactive

for spec in "${CERT_SPECS[@]}"; do
  set -- $spec
  primary="$1"; shift
  hosts="$@"

  echo "==> Copying renewed '$primary' into nginx/certs/<host>/"
  for host in $hosts; do mkdir -p "nginx/certs/$host"; done
  docker compose --profile cert run --rm --entrypoint sh certbot -c "
set -eu
for host in $hosts; do
  cp -L /etc/letsencrypt/live/$primary/fullchain.pem /etc/letsencrypt/live-out/\$host/fullchain.pem
  cp -L /etc/letsencrypt/live/$primary/privkey.pem   /etc/letsencrypt/live-out/\$host/privkey.pem
done
"
done

echo "==> Reloading Nginx (zero downtime)"
docker compose exec -T nginx nginx -s reload
echo "==> Renewal complete"
