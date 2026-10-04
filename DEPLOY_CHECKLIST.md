# Pizza Denfert — Deployment Pre-flight Checklist

Run this from top to bottom before your first production deploy. Every step
should end with a ✅ before moving on.

## 0. Prerequisites on the VPS

- [ ] Ubuntu 22.04+ or Debian 12+ (x86-64 or ARM64).
- [ ] Public IPv4 with ports 80 and 443 open.
- [ ] DNS A records point to that IP:
      - `api.pizzadenfert.fr` → VPS IP
      - `loyalty.pizzadenfert.fr` → VPS IP
- [ ] Root SSH access (or a sudoer account you can use).

## 1. Rotate the leaked SSH deploy key

A key with fingerprint `SHA256:lKhN02IlpS9dbSzHHN9j5DDrpuqzXsjlf6n/P5cij9I`
was leaked to git history on 2026-07. Before the VPS trusts anything:

- [ ] Remove the old public key from `/root/.ssh/authorized_keys` on any host
      that was configured to trust it.
- [ ] Remove it from GitHub Deploy Keys:
      https://github.com/PizzaDenfert99/denfert-pizzeria/settings/keys
- [ ] Generate a new pair: `ssh-keygen -t ed25519 -f ~/.ssh/pizzadenfert-deploy`.
- [ ] Install the new public key wherever the old one was.
- [ ] (Optional) Rewrite git history to purge the blob (see the incident notes
      at the bottom of `DEPLOY.md`). Not required if the key is rotated.

## 2. Clone the repo on the VPS

```bash
git clone https://github.com/PizzaDenfert99/denfert-pizzeria.git /root/denfert-pizzeria
cd /root/denfert-pizzeria
```

- [ ] `git status` reports "nothing to commit, working tree clean".
- [ ] `git log -1 --oneline` shows the commit hash you expect.

## 3. Bootstrap

```bash
sudo make bootstrap
```

- [ ] Docker Engine ≥ 24 installed (`docker --version`).
- [ ] Docker Compose v2 plugin installed (`docker compose version`).
- [ ] `.env` created from `.env.docker.example` with a fresh `JWT_SECRET`.
- [ ] Placeholder self-signed certs exist under `nginx/certs/*/`.

## 4. Fill in real secrets in `.env`

Open `.env` and set:

- [ ] `POSTGRES_PASSWORD` — generate with `openssl rand -hex 24`.
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — only if you want web push.
- [ ] `TWILIO_*` / `OVH_*` — only if you want real SMS OTP; otherwise leave empty (demo mode).

Sanity-check:

```bash
make env-check
```

- [ ] All required keys reported `[ok]`.

## 5. Obtain real TLS certificates

> **⚠️ DEPRECATED — see [CERTS.md](./CERTS.md).** The host-certbot + renewal-hook steps below do NOT work on this host (Nginx runs only in Docker) and caused a real outage on 2026-10-04. Use scripts/cert-issue.sh / scripts/cert-renew.sh instead.

```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone \
  -d api.pizzadenfert.fr -d loyalty.pizzadenfert.fr \
  --agree-tos -m you@pizzadenfert.fr --non-interactive
```

- [ ] Certs live under `/etc/letsencrypt/live/api.pizzadenfert.fr/`.

Copy them into the Nginx tree and install the renewal hook:

```bash
sudo bash scripts/certbot-renew.sh
sudo cp scripts/certbot-renew.sh /etc/letsencrypt/renewal-hooks/deploy/
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/certbot-renew.sh
```

- [ ] `ls nginx/certs/api.pizzadenfert.fr/` shows both `fullchain.pem` and `privkey.pem`.
- [ ] `ls nginx/certs/loyalty.pizzadenfert.fr/` shows the same.
- [ ] `certbot renew --dry-run` passes.

## 6. Bring the stack up

```bash
sudo make config      # validates docker-compose.yml
sudo make up          # docker compose up -d --build
sudo make status      # 3 services should be 'running' + 'healthy'
sudo make health      # both hostnames should return HTTP 200
```

- [ ] `mongo`, `backend`, `nginx` all report `running/healthy`.
- [ ] `curl https://api.pizzadenfert.fr/api/healthz` returns `{"status":"ok"}`.
- [ ] `curl https://api.pizzadenfert.fr/api/menu` returns a non-empty JSON array.
- [ ] Same for `https://loyalty.pizzadenfert.fr/api/healthz`.

## 7. Schedule backups

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * cd /root/denfert-pizzeria && make backup >> /var/log/pizzadenfert-backup.log 2>&1") | crontab -
```

- [ ] `sudo make backup` produces a `.archive.gz` in `./backups/`.
- [ ] Cron entry visible in `sudo crontab -l`.

## 8. (Optional) Enable CI/CD auto-deploy

See `.github/workflows/deploy.yml`. Requires:

- [ ] A new SSH key pair generated for GitHub Actions (do NOT reuse anything).
- [ ] Public key added to `/root/.ssh/authorized_keys` on the VPS.
- [ ] Private key + host in GitHub repo secrets: `VPS_SSH_KEY`, `VPS_HOST`, `VPS_USER`.
- [ ] A test push to `main` triggers a successful workflow run.

## 9. Point the customer app at the new backend

The customer Expo app's `frontend/.env` already points at
`https://loyalty.pizzadenfert.fr`, so any rebuild will use the new stack.

- [ ] Rebuild the customer app (Emergent Publish) after cutover.
- [ ] Test the customer app once more against the new backend.

---

When every checkbox above is ticked, you are live. Roll back with:

```bash
sudo make down
git checkout <previous-good-commit>
sudo make up
```
