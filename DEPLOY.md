# Pizza Denfert — Deploy on your own VPS with Docker

This is the complete self-hosted playbook. It replaces the old `deploy/`
shell scripts. Docker Compose brings up MongoDB, the FastAPI backend, and
Nginx (reverse proxy + TLS termination) on a single VPS.

## Prerequisites

- A VPS running Ubuntu 22.04+ or Debian 12+ (any x86-64 or ARM64 host works).
- DNS **A records** pointing to the VPS public IP:
  - `api.pizzadenfert.fr`
  - `loyalty.pizzadenfert.fr` (legacy mirror, still used by existing tablets)
- Ports **80** and **443** open in the firewall.
- Docker Engine 24+ and Docker Compose v2 installed:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

## First-time deployment

### 1. Clone the repo

```bash
git clone https://github.com/PizzaDenfert99/denfert-pizzeria.git /root/denfert-pizzeria
cd /root/denfert-pizzeria
```

### 2. Configure environment

```bash
cp .env.docker.example .env
nano .env
```

At minimum, generate a strong `JWT_SECRET`:

```bash
JWT_SECRET="$(openssl rand -hex 32)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
```

Paste your Supabase service-role key into `SUPABASE_SERVICE_ROLE_KEY` and
the anon key into `SUPABASE_ANON_KEY`.

### 3. Obtain TLS certificates

Stop anything binding to port 80 first, then use Certbot in standalone mode
(one-shot). We do NOT run Certbot inside a container to keep the setup
minimal — renewal is a monthly cron/systemd-timer job.

```bash
apt-get install -y certbot
certbot certonly --standalone \
  -d api.pizzadenfert.fr -d loyalty.pizzadenfert.fr \
  --agree-tos -m you@pizzadenfert.fr --non-interactive
```

Copy the certs into the layout Nginx expects:

```bash
mkdir -p nginx/certs/api.pizzadenfert.fr nginx/certs/loyalty.pizzadenfert.fr
cp /etc/letsencrypt/live/api.pizzadenfert.fr/fullchain.pem \
   nginx/certs/api.pizzadenfert.fr/
cp /etc/letsencrypt/live/api.pizzadenfert.fr/privkey.pem \
   nginx/certs/api.pizzadenfert.fr/
cp /etc/letsencrypt/live/loyalty.pizzadenfert.fr/fullchain.pem \
   nginx/certs/loyalty.pizzadenfert.fr/
cp /etc/letsencrypt/live/loyalty.pizzadenfert.fr/privkey.pem \
   nginx/certs/loyalty.pizzadenfert.fr/
```

### 4. Bring the stack up

```bash
docker compose up -d --build
docker compose ps          # should show 3 healthy services
docker compose logs -f backend
```

### 5. Verify

```bash
curl -fsS https://api.pizzadenfert.fr/api/healthz
# {"status":"ok"}

curl -fsS https://api.pizzadenfert.fr/api/menu | head -c 200
# JSON array of menu items
```

## Zero-downtime updates

Deploy a new commit from `main`:

```bash
cd /root/denfert-pizzeria
git pull --ff-only
docker compose up -d --build backend nginx
```

`docker compose` will only recreate the containers whose image or config
changed. MongoDB stays up.

## Backups

MongoDB persistence uses the named Docker volume `mongo_data`. Snapshot it
with:

```bash
docker run --rm -v pizzadenfert_mongo_data:/data \
  -v $(pwd)/backups:/out alpine tar czf /out/mongo-$(date +%F).tgz -C /data .
```

Schedule via cron.

## Certificate renewal

Certbot places renewal hooks in `/etc/cron.d/certbot`. After each renewal,
re-copy the certs into `nginx/certs/` and `docker compose exec nginx nginx -s reload`.
A `deploy-hook` script example:

```bash
cat > /etc/letsencrypt/renewal-hooks/deploy/copy-to-nginx.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
for host in api.pizzadenfert.fr loyalty.pizzadenfert.fr; do
  cp -f /etc/letsencrypt/live/$host/fullchain.pem /root/denfert-pizzeria/nginx/certs/$host/
  cp -f /etc/letsencrypt/live/$host/privkey.pem   /root/denfert-pizzeria/nginx/certs/$host/
done
docker compose -f /root/denfert-pizzeria/docker-compose.yml exec -T nginx nginx -s reload
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/copy-to-nginx.sh
```

## Troubleshooting

| Symptom                                | Fix                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `backend` container restarts in a loop | `docker compose logs backend` — usually a missing `JWT_SECRET` in `.env`.               |
| `502 Bad Gateway` from Nginx           | Backend is not healthy yet. Wait for `/api/healthz` to return 200 (up to 15 s).         |
| Menu is empty                          | Check `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; the app also has a Mongo fallback.  |
| Cert renewal fails                     | Confirm port 80 is free at renewal time (Certbot standalone needs it).                  |

## Roadmap

- [ ] CI/CD via GitHub Actions (auto-deploy on push to `main`) — see `ARCHITECTURE.md`.
- [ ] Move to a compose profile that includes a `certbot` sidecar for automatic renewal.
- [ ] Optional: switch `mongo` to a managed MongoDB Atlas cluster for HA — only change is `MONGO_URL` in `.env`.
