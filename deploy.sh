#!/usr/bin/env bash
# Pizza Denfert · one-shot deploy from this Emergent pod to the Hetzner VPS.
# Uses persistent SSH key at /app/.deploy/id_ed25519 (no password required).
# Idempotent · keeps a backup of the previous bundle · never touches the DB.
#
# Usage:
#   bash /app/deploy.sh                  # deploy frontend + backend
#   bash /app/deploy.sh frontend         # frontend only
#   bash /app/deploy.sh backend          # backend only
#   bash /app/deploy.sh restart          # only restart services (no code change)
#   bash /app/deploy.sh health           # only run smoke tests

set -euo pipefail

HOST="${PIZZADENFERT_HOST:-178.104.58.91}"
USER="${PIZZADENFERT_USER:-root}"
KEY="${PIZZADENFERT_KEY:-/app/.deploy/id_ed25519}"
SSH_OPTS="-i ${KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o ServerAliveInterval=30"
SSH="ssh ${SSH_OPTS} ${USER}@${HOST}"
SCP="scp ${SSH_OPTS}"

MODE="${1:-all}"
TS=$(date +%Y%m%d_%H%M%S)
LOG() { echo -e "\n\033[1;36m==> $*\033[0m"; }

# --- Sanity checks ---
if [ ! -f "$KEY" ]; then
  echo "❌ SSH key missing at $KEY" >&2
  exit 1
fi
chmod 600 "$KEY"

# Quick reachability probe BEFORE doing any work
if ! $SSH -o BatchMode=yes 'true' 2>/dev/null; then
  echo "❌ SSH connection to ${USER}@${HOST} failed."
  echo "   The public key may not be on the server yet. Run this on the VPS once:"
  echo "      mkdir -p ~/.ssh && chmod 700 ~/.ssh && \\"
  echo "      echo '$(cat ${KEY}.pub)' >> ~/.ssh/authorized_keys && \\"
  echo "      chmod 600 ~/.ssh/authorized_keys"
  exit 2
fi

deploy_frontend() {
  LOG "FRONTEND: build static export"
  cd /app/frontend
  rm -rf dist
  EXPO_NO_TELEMETRY=1 yarn --silent expo export -p web --output-dir dist 2>&1 | tail -4
  echo "  bundle size: $(du -sh dist | awk '{print $1}')"
  ENTRY=$(find dist/_expo/static/js/web -name 'entry-*.js' -exec basename {} \;)
  echo "  entry hash:  $ENTRY"

  LOG "FRONTEND: package + upload"
  tar -czf /tmp/dist.tgz dist
  $SCP /tmp/dist.tgz ${USER}@${HOST}:/tmp/dist.tgz

  LOG "FRONTEND: atomic swap on server"
  $SSH bash <<EOF
set -euo pipefail
BKDIR="/var/www/admin-pizzadenfert_bk_${TS}"
mv /var/www/admin-pizzadenfert "\$BKDIR"
ls -td /var/www/admin-pizzadenfert_bk_* | tail -n +4 | xargs -r rm -rf
mkdir -p /var/www/admin-pizzadenfert
tar -xzf /tmp/dist.tgz -C /tmp
mv /tmp/dist/* /var/www/admin-pizzadenfert/
chown -R www-data:www-data /var/www/admin-pizzadenfert
rm -rf /tmp/dist /tmp/dist.tgz
nginx -t && systemctl reload nginx
echo "  ✓ frontend deployed (backup: \$BKDIR)"
EOF
}

deploy_backend() {
  LOG "BACKEND: upload code + dependencies"
  $SCP /app/backend/server.py ${USER}@${HOST}:/tmp/server.py
  # Ship a lean requirements (only what server.py actually imports)
  cat > /tmp/req_clean.txt <<'REQ'
fastapi==0.110.1
uvicorn[standard]==0.25.0
motor==3.3.1
pymongo==4.5.0
pydantic[email]==2.13.4
python-dotenv==1.2.2
bcrypt==4.1.3
PyJWT==2.13.0
httpx==0.28.1
anyio==4.13.0
REQ
  $SCP /tmp/req_clean.txt ${USER}@${HOST}:/tmp/requirements.txt

  LOG "BACKEND: install + smoke-import + restart"
  $SSH bash <<'EOF'
set -euo pipefail
install -o pizza -g pizza -m 644 /tmp/server.py /opt/pizzadenfert/app/server.py
if ! cmp -s /tmp/requirements.txt /opt/pizzadenfert/app/requirements.txt 2>/dev/null; then
  install -o pizza -g pizza -m 644 /tmp/requirements.txt /opt/pizzadenfert/app/requirements.txt
  sudo -u pizza /opt/pizzadenfert/venv/bin/pip install --quiet --no-cache-dir -r /opt/pizzadenfert/app/requirements.txt
fi
# Smoke-import BEFORE restart (catches syntax errors)
sudo -u pizza bash -c 'cd /opt/pizzadenfert/app && /opt/pizzadenfert/venv/bin/python -c "
from dotenv import load_dotenv; load_dotenv()
import server
print(\"  ✓ server.py imports cleanly\")"' || { echo "❌ smoke-import failed — ABORTING (no service restart)"; exit 1; }
systemctl restart pizzadenfert-api.service
sleep 4
STATE=$(systemctl is-active pizzadenfert-api.service)
echo "  service state: $STATE"
[ "$STATE" = "active" ] || { echo "❌ service not active after restart"; journalctl -u pizzadenfert-api -n 30 --no-pager; exit 1; }
EOF
}

restart_services() {
  LOG "Restart services on the server"
  $SSH bash <<'EOF'
systemctl restart pizzadenfert-api.service && sleep 3
echo "  api:     $(systemctl is-active pizzadenfert-api.service)"
echo "  mongod:  $(systemctl is-active mongod)"
echo "  nginx:   $(systemctl is-active nginx)"
EOF
}

health_check() {
  LOG "End-to-end smoke tests"
  for path in /admin /admin-cms /admin-cms/dashboard /admin-staff /admin-stats /admin-settings; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "https://admin.pizzadenfert.fr${path}")
    printf "  https://admin.pizzadenfert.fr%-25s %s\n" "$path" "$code"
  done
  for path in / /api/healthz /api/menu; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "https://api.pizzadenfert.fr${path}")
    printf "  https://api.pizzadenfert.fr%-25s %s\n" "$path" "$code"
  done
}

case "$MODE" in
  all)       deploy_backend; deploy_frontend; restart_services; health_check ;;
  frontend)  deploy_frontend; health_check ;;
  backend)   deploy_backend;  health_check ;;
  restart)   restart_services; health_check ;;
  health)    health_check ;;
  *) echo "Usage: $0 [all|frontend|backend|restart|health]"; exit 1 ;;
esac

LOG "✓ Done."
