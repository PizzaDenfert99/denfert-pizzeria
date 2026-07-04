#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pizza Denfert — obtain real Let's Encrypt certs without stopping Nginx.
#
# Issues TWO separate SAN certs via the HTTP-01 webroot method:
#
#   Lineage A (customer web)  : pizzadenfert.fr + www.pizzadenfert.fr
#   Lineage B (backend hosts) : api.pizzadenfert.fr + loyalty.pizzadenfert.fr
#
# Certbot writes challenge files to /var/www/certbot inside a shared Docker
# volume; the already-running Nginx serves them under /.well-known/acme-
# challenge/; Let's Encrypt validates; certbot writes the certs into the
# certbot_data volume; and this script copies each SAN cert into all of the
# hostname directories under nginx/certs/, then reloads Nginx. Zero downtime.
#
# Idempotent: certbot's --keep-until-expiring flag means re-running the
# script within the cert validity window is a no-op.
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

# Each spec is "primary-cert-name domain1 domain2 ..."
# The primary name is what certbot uses for the lineage directory under
# /etc/letsencrypt/live/<name>/. We use it to look up + copy the cert files.
CERT_SPECS=(
  "pizzadenfert.fr pizzadenfert.fr www.pizzadenfert.fr"
  "api.pizzadenfert.fr api.pizzadenfert.fr loyalty.pizzadenfert.fr"
)

echo "==> Ensuring Nginx is running (needed for HTTP-01 challenge)"
if ! docker compose ps --status running 2>/dev/null | grep -q pizzadenfert-nginx; then
  docker compose up -d nginx
  sleep 3
fi

for spec in "${CERT_SPECS[@]}"; do
  set -- $spec
  primary="$1"; shift
  hosts="$@"

  echo "==> Requesting cert '$primary' for domains: $hosts"
  ARGS="certonly --webroot -w /var/www/certbot --agree-tos --no-eff-email --non-interactive --keep-until-expiring -m $EMAIL --cert-name $primary"
  for h in $hosts; do ARGS="$ARGS -d $h"; done
  docker compose --profile cert run --rm --entrypoint certbot certbot $ARGS

  echo "==> Copying '$primary' into nginx/certs/<host>/ for each server block"
  for host in $hosts; do mkdir -p "nginx/certs/$host"; done
  docker compose --profile cert run --rm --entrypoint sh certbot -c "
set -eu
for host in $hosts; do
  cp -L /etc/letsencrypt/live/$primary/fullchain.pem /etc/letsencrypt/live-out/\$host/fullchain.pem
  cp -L /etc/letsencrypt/live/$primary/privkey.pem   /etc/letsencrypt/live-out/\$host/privkey.pem
  chmod 644 /etc/letsencrypt/live-out/\$host/fullchain.pem
  chmod 600 /etc/letsencrypt/live-out/\$host/privkey.pem
done
"
done

echo "==> Reloading Nginx (zero downtime)"
docker compose exec -T nginx nginx -s reload

echo "==> Done. Verify with:"
echo "    curl -fsS https://pizzadenfert.fr"
echo "    curl -fsS https://api.pizzadenfert.fr/api/healthz"
