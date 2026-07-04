#!/bin/sh
# ---------------------------------------------------------------------------
# Nginx container entrypoint.
#
# 1. For every hostname we serve (matches server_name blocks in nginx.conf),
#    check that /etc/nginx/certs/<host>/{fullchain,privkey}.pem exist.
#    If any are missing, generate a SELF-SIGNED placeholder — valid 30 days,
#    2048-bit RSA — so the container can start on a fresh VPS.
# 2. Ensure the ACME HTTP-01 webroot exists.
# 3. Delegate to the stock `docker-entrypoint.sh` shipped with nginx:alpine,
#    which resolves envsubst templates and finally executes CMD.
#
# This script is safe to re-run: it never overwrites existing certs.
# ---------------------------------------------------------------------------
set -eu

HOSTS="${NGINX_CERT_HOSTS:-api.pizzadenfert.fr loyalty.pizzadenfert.fr}"

for host in $HOSTS; do
  dir="/etc/nginx/certs/$host"
  fullchain="$dir/fullchain.pem"
  privkey="$dir/privkey.pem"

  if [ ! -f "$fullchain" ] || [ ! -f "$privkey" ]; then
    echo "[nginx-init] Missing cert for $host — generating a self-signed placeholder (30d)."
    mkdir -p "$dir"
    openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
      -keyout "$privkey" \
      -out    "$fullchain" \
      -subj   "/CN=$host" >/dev/null 2>&1
    chmod 644 "$fullchain"
    chmod 600 "$privkey"
    echo "[nginx-init] Placeholder written to $dir. REPLACE with a real cert (see DEPLOY.md)."
  else
    echo "[nginx-init] $host — certs present."
  fi
done

# ACME HTTP-01 webroot must exist even if nobody has issued a cert yet.
mkdir -p /var/www/certbot

# Hand off to the standard nginx entrypoint (envsubst templates + exec CMD).
exec /docker-entrypoint.sh "$@"
