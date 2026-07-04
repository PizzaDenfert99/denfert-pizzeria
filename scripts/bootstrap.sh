#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pizza Denfert — first-time VPS bootstrap.
#
# Run this ONCE on a fresh Ubuntu 22.04+ / Debian 12+ VPS after cloning the
# repo. It is idempotent — safe to re-run.
#
#   sudo bash scripts/bootstrap.sh
#
# What it does:
#   1. Installs Docker Engine + Compose plugin (if missing).
#   2. Creates .env from .env.docker.example (if missing), with a fresh
#      JWT_SECRET pre-populated.
#   3. Creates the nginx/certs/ tree so the containers can start even before
#      real Let's Encrypt certs are in place (self-signed placeholders).
#   4. Prints exactly what to do next (obtain real certs + docker compose up).
#
# The script NEVER prints secrets to stdout. It only writes them to .env with
# 0600 permissions.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

log() { printf "\033[1;36m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[!]\033[0m %s\n" "$*" >&2; }
die() { printf "\033[1;31m[x]\033[0m %s\n" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo bash scripts/bootstrap.sh)"

# --- 1. Docker Engine + Compose plugin --------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine (via get.docker.com) ..."
  curl -fsSL https://get.docker.com | sh
else
  log "Docker already installed: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  die "Docker Compose v2 plugin missing. Reinstall Docker: curl -fsSL https://get.docker.com | sh"
else
  log "Docker Compose ready: $(docker compose version)"
fi

# --- 1b. Detect a host-installed mongod on port 27017 (Hetzner cloud images
#         sometimes ship one pre-installed and it will collide with docker
#         compose up if we ever expose that port to the host). ---------------
if ss -ltn 2>/dev/null | grep -q ':27017 '; then
  warn "A process is already LISTENING on host port 27017."
  warn "Our docker-compose no longer binds Mongo to the host, so the containers"
  warn "themselves are safe. But if you also run 'docker run -p 27017:27017' or"
  warn "add ports mapping later, it WILL collide. Consider stopping the host"
  warn "mongod:   systemctl stop mongod && systemctl disable mongod"
fi

# --- 2. .env ---------------------------------------------------------------
if [ ! -f .env ]; then
  log "Generating .env from .env.docker.example ..."
  cp .env.docker.example .env
  chmod 600 .env
  # Auto-generate a strong JWT_SECRET so the stack can boot.
  JWT_SECRET_NEW="$(openssl rand -hex 32)"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET_NEW|" .env
  log ".env created with a fresh JWT_SECRET (chmod 600)"
  warn "Edit .env to add SUPABASE_SERVICE_ROLE_KEY (and any optional SMS/VAPID keys)"
else
  log ".env already exists — leaving it alone"
fi

# --- 3. nginx/certs/ placeholders ------------------------------------------
for host in api.pizzadenfert.fr loyalty.pizzadenfert.fr; do
  cert_dir="nginx/certs/$host"
  mkdir -p "$cert_dir"
  if [ ! -f "$cert_dir/fullchain.pem" ] || [ ! -f "$cert_dir/privkey.pem" ]; then
    log "Creating self-signed placeholder cert for $host ..."
    openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
      -keyout "$cert_dir/privkey.pem" \
      -out    "$cert_dir/fullchain.pem" \
      -subj "/CN=$host" >/dev/null 2>&1
    warn "$cert_dir uses a SELF-SIGNED cert. Replace with a real Let's Encrypt cert before going live (see DEPLOY.md §3)."
  else
    log "$cert_dir has certs — leaving them alone"
  fi
done

# --- 4. Next steps ---------------------------------------------------------
cat <<'NEXT'

===============================================================================
Bootstrap complete. Next steps:

  1. Edit /root/denfert-pizzeria/.env  (SUPABASE_SERVICE_ROLE_KEY etc.)
  2. Obtain real TLS certs (see DEPLOY.md §3), or keep the self-signed ones
     for a private test run.
  3. Bring the stack up:

        make up
        make health

  4. Set up automatic Let's Encrypt renewal:

        cp scripts/certbot-renew.sh /etc/letsencrypt/renewal-hooks/deploy/
        chmod +x /etc/letsencrypt/renewal-hooks/deploy/certbot-renew.sh

  5. Schedule Mongo backups:

        (crontab -l 2>/dev/null; echo "0 3 * * * cd /root/denfert-pizzeria && make backup >> /var/log/pizzadenfert-backup.log 2>&1") | crontab -

===============================================================================
NEXT
