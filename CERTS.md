# TLS Certificate Renewal — Canonical Setup

> **This is the single source of truth for TLS certs on this VPS.**
> If any other doc in this repo (`DEPLOY.md`, `DEPLOY_CHECKLIST.md`,
> `README-DEPLOYMENT.md`, `ARCHITECTURE.md`) disagrees with this file,
> **this file wins** — the others are historical and partly describe a
> setup that no longer applies (see "Why this doc exists" below).

## How it actually works (as of 2026-10-04)

Nginx runs **only inside Docker** (`pizzadenfert-nginx`, ports 80/443
published via `docker-proxy`). There is **no system nginx** on this host.
Certs are issued/renewed by a **dockerized certbot** (the `certbot`
service, `profiles: ["cert"]`, in `docker-compose.yml`), using the
HTTP-01 **webroot** method against a volume (`certbot_webroot`) shared
with the Nginx container — so renewal never needs to stop Nginx or bind
port 80 on the host.

- **Issue a new cert / add a domain:** `scripts/cert-issue.sh you@email`
- **Renew existing certs:** `scripts/cert-renew.sh`
- Both scripts copy the renewed `fullchain.pem`/`privkey.pem` into
  `nginx/certs/<host>/` (bind-mounted into the Nginx container) and then
  `docker compose exec -T nginx nginx -s reload` — zero downtime.

Two SAN lineages exist:
- `pizzadenfert.fr` → covers `pizzadenfert.fr`, `www.pizzadenfert.fr`
- `api.pizzadenfert.fr` → covers `api.pizzadenfert.fr` **and**
  `loyalty.pizzadenfert.fr` (fixed 2026-10-04 — previously only covered
  `api.pizzadenfert.fr`, see Known Issues).

## Automatic renewal (cron)

Installed in **root's crontab** on the VPS:

```cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=root
0 3,15 * * * cd /root/denfert-pizzeria && /usr/bin/flock -n /tmp/pizzadenfert-cert-renew.lock bash scripts/cert-renew.sh >> /var/log/pizzadenfert-cert.log 2>&1
```

- Runs twice daily (03:00 / 15:00 UTC); certbot only actually renews
  within ~30 days of expiry, so most runs are no-ops.
- `flock -n` prevents overlapping runs if one hangs.
- Output (including failures) is appended to
  `/var/log/pizzadenfert-cert.log`.
- Verified 2026-10-04: ran successfully both normally and under a
  simulated minimal cron environment (`env -i` with only `HOME`/`SHELL`/
  `PATH` set) — exit code 0, certs confirmed renewed/valid.

**To check it's healthy at any time:**

```bash
tail -50 /var/log/pizzadenfert-cert.log
cd /root/denfert-pizzeria && docker compose --profile cert run --rm \
  --entrypoint certbot certbot certificates
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://pizzadenfert.fr/
```

## Failure monitoring

The ACME account used by the dockerized certbot has its contact email
set to **ayat3411@gmail.com** (`certbot update_account --email ...`,
done 2026-10-04). If a cert goes unrenewed, **Let's Encrypt itself**
emails that address starting ~20 days before expiry, with reminders
closer in.

This is a **backstop, not instant alerting** — it only fires when a
cert is already close to expiring, not the moment a single cron run
fails. If you want same-day failure notification instead/also (e.g. a
healthchecks.io dead-man's-switch, or SMTP-based alerting from the cron
job itself), that needs one more piece of setup (relay credentials or a
third-party webhook) — ask for it explicitly if you want it added.

## ⚠️ Why this doc exists — do not repeat this incident

On 2026-10-04, `pizzadenfert.fr` was found serving an **expired cert**
(all 4 subdomains had been expired since Sep 11–18). Root cause: a
**host-level** `certbot` (installed via both `apt` and `snap`, running
on `certbot.timer` / `snap.certbot.renew.timer`) was configured with the
`nginx` authenticator/installer plugin — which only works against a
real system nginx. Since nginx runs **only in Docker** here, that plugin
could never actually validate or reload anything. It failed silently,
twice a day, for weeks, while the *correct* dockerized renewal path
(above) was never scheduled at all (`crontab -l` was empty).

Multiple docs in this repo (`DEPLOY.md` §3, `DEPLOY_CHECKLIST.md` §5,
`README-DEPLOYMENT.md` §TLS) still describe variants of that broken
host-level/standalone/nginx-plugin approach, left over from before — or
alongside — the Docker migration. **Do not follow those sections.**
Specifically:

- Do **not** `apt-get install certbot` / `snap install certbot` and run
  `certbot certonly --standalone` or `certbot --nginx` on this host.
  There is no process that can bind port 80 outside Docker, and no
  system nginx for the `--nginx` plugin to drive.
- Do **not** re-enable `certbot.timer` or `snap.certbot.renew.timer`.
- The only supported path is `scripts/cert-issue.sh` /
  `scripts/cert-renew.sh` via `docker compose --profile cert`.

## Known issues

1. **FIXED 2026-10-04:** `loyalty.pizzadenfert.fr` was serving a
   hostname-mismatched cert (a copy of the `api.pizzadenfert.fr` cert,
   whose SAN list didn't include `loyalty...`). Re-issued via
   `scripts/cert-issue.sh` so the `api.pizzadenfert.fr` lineage now has
   SANs for both `api.pizzadenfert.fr` and `loyalty.pizzadenfert.fr`.
   Verified: `curl https://loyalty.pizzadenfert.fr` now returns HTTP 200
   with a valid cert.
2. **STILL OPEN: `admin.pizzadenfert.fr` is orphaned.** DNS points it at
   this VPS, but there is no matching `server_name` block in
   `nginx/nginx.conf` or service in `docker-compose.yml` — it has no
   current cert path, gets a hostname-mismatch TLS error, and isn't
   served by the live stack. Needs an owner decision: drop the DNS
   record, or wire it up properly in `nginx.conf` + re-issue a cert for it.
3. **STILL OPEN: stray host-level certbot timers are still enabled.**
   `certbot.timer` and `snap.certbot.renew.timer` still run twice a day
   and will keep failing forever (harmless noise, see "Why this doc
   exists" above). Disable with:
   `systemctl disable --now certbot.timer snap.certbot.renew.timer`
4. **STILL OPEN: `denfert-pizzeria` repo has ~6 weeks of uncommitted
   production changes.** `git log` HEAD on this VPS checkout is
   2026-07-12, but `backend/server.py`, `frontend/src/api.ts`,
   `frontend/app/kiosk.tsx`, `frontend/app/admin-cms/dashboard.tsx`, and
   `nginx/nginx.conf` (among others) were last modified 2026-08-23 and
   never committed/pushed to `origin` (github.com/PizzaDenfert99/denfert-pizzeria).
   Risk: any `git reset --hard` / fresh clone / redeploy from GitHub
   would silently discard these live fixes (including the loyalty SPA
   fix this doc describes). Recommend committing and pushing the current
   working tree before doing any git-based redeploy.
