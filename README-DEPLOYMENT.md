# Pizza Denfert — Deployment Guide

This document covers every deployment path for the Pizza Denfert restaurant app:

1. **EAS Build** — Generate signed Android APK / AAB and iOS IPA (recommended for the mobile admin app).
2. **Web** — Run the customer-facing menu as a PWA on Emergent OR on your own VPS.
3. **Self-hosted backend** — Run the FastAPI + MongoDB backend on a Linux VPS.

---

## Project structure

```
/
├── frontend/                  # Expo (managed workflow, SDK 54)
│   ├── app/                   # Expo Router screens
│   ├── src/                   # API client, theme, i18n, hooks, auth context
│   ├── app.json               # Expo config (permissions, plugins, etc.)
│   ├── eas.json               # EAS Build / Submit profiles
│   ├── package.json
│   └── .env                   # EXPO_PUBLIC_BACKEND_URL (no secrets)
└── backend/                   # FastAPI
    ├── server.py              # All API routes, auth, loyalty, admin
    ├── requirements.txt
    └── .env                   # MONGO_URL, DB_NAME, JWT_SECRET
```

---

## Part 1 — Android APK / AAB build via EAS

EAS Build is Expo's hosted build service. The free tier is enough for one-off builds
(one production-priority queue slot at a time; free APK & AAB output).

### 1.1 Prerequisites (one-time, on your local machine)

```bash
# Node.js 20+ recommended
npm install -g eas-cli

# Sign in (or create) a free Expo account at https://expo.dev
eas login
```

### 1.2 Link the project

From the root of the cloned repo:

```bash
cd frontend
eas init           # creates an EAS project ID if not yet linked
```

This writes `extra.eas.projectId` into `app.json`. Commit that change.

### 1.3 Edit `eas.json` (already provided)

Open `frontend/eas.json` and update the `env.EXPO_PUBLIC_BACKEND_URL` per profile so
your built app points at the right backend:

| Profile | Output | Backend URL it embeds |
|---|---|---|
| `development` | APK with dev client | the Emergent preview URL |
| `preview` | Internal-distribution APK | the Emergent preview URL |
| `production` | Play-Store AAB | your production API (e.g. `https://api.pizzadenfert.fr`) |
| `production-apk` | Signed APK with prod config | your production API |

### 1.4 Generate the keystore on first build

EAS will auto-create the Android keystore the first time you build:

```bash
cd frontend
eas build --platform android --profile preview
```

When prompted:
- "Generate a new Android Keystore?" → **Yes**
- EAS will create and store the keystore on its servers.

The build takes 10–20 minutes. Once done you'll see a link to download the `.apk`.

### 1.5 Subsequent builds

```bash
# Internal-distribution APK (sideload on a tablet for restaurant staff)
eas build --platform android --profile preview

# Play Store AAB (production release)
eas build --platform android --profile production

# Production-quality APK (same as AAB but easier to install manually)
eas build --platform android --profile production-apk

# iOS — requires an Apple Developer account ($99/year)
eas build --platform ios --profile preview
```

### 1.6 **CRITICAL — Download and back up your keystore**

The Play Store requires the **same** keystore for every future update of an app.
If you lose it you must publish the app under a new package name. Back it up
immediately after your first production build:

```bash
cd frontend
eas credentials
# Choose:  Android  →  production  →  Keystore  →  Download credentials
```

EAS writes a JSON file containing:
- The `.jks` keystore (base64-encoded)
- `keystorePassword`
- `keyAlias`
- `keyPassword`

To recover the raw `.jks` from the JSON:

```bash
node -e 'const j=require("./credentials.json");require("fs").writeFileSync("denfert.jks",Buffer.from(j.keystore.keystore,"base64"))'
```

**Store this file in TWO secure locations** (e.g. password manager + offline backup).
Without it you cannot publish updates to the same Play Store listing.

### 1.7 Submit to Google Play Store

1. Create a Play Console account at https://play.google.com/console (one-time $25 fee).
2. Create the app listing manually (title, screenshots, content rating, etc.).
3. Create a Google Cloud service account with the **Service Account User** + **Android Publisher** roles. Download the JSON key as `frontend/play-store-service-account.json` (the path referenced in `eas.json`).
4. Then:

```bash
cd frontend
eas submit --platform android --profile production --latest
```

This uploads the latest AAB build to the **internal testing track** by default
(safer than going straight to production). Promote to production from the
Play Console UI when you're happy.

---

## Part 2 — Customer-facing web (PWA)

The customer side (browse menu, make reservation, see loyalty QR) works perfectly
as a web app — no native build required. There are two hosting options:

### 2.1 Emergent hosting (easiest)

Click **Publish** in the Emergent UI. The platform handles the Expo `export --platform web`
build and serves it from `https://<your-slug>.preview.emergentagent.com`.
- Cost: 50 credits one-time + 50 credits/month per the Emergent pricing.
- Backend (`/api/*`) is reverse-proxied to the FastAPI service on the same host.
- ✅ Use this for the public restaurant menu accessed via table QR codes.

### 2.2 Self-hosted web on your VPS

```bash
cd frontend
npx expo export --platform web
# Output is in frontend/dist/
```

Serve `frontend/dist/` with Nginx or Caddy and point `/api/` at your FastAPI backend.
See Part 3 for the backend setup.

---

## Part 3 — Self-hosted backend on a Linux VPS

The backend is a single FastAPI process (`server.py`) backed by MongoDB.

### 3.1 Provision the VPS

Any provider works (Hetzner CX21 €4.50/mo, OVH, DigitalOcean, etc.). Minimum:
- 2 vCPU
- 2 GB RAM
- 20 GB SSD
- Ubuntu 22.04 LTS

### 3.2 Install dependencies

```bash
sudo apt update && sudo apt install -y python3.11 python3.11-venv python3-pip nginx git

# MongoDB 7
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-7.gpg
echo "deb [signed-by=/usr/share/keyrings/mongodb-7.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

### 3.3 Clone and configure

```bash
cd /opt
sudo git clone <your-github-repo> pizza-denfert
cd pizza-denfert/backend

python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `/opt/pizza-denfert/backend/.env`:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=pizza_denfert
JWT_SECRET=<run: python3 -c "import secrets; print(secrets.token_hex(32))">
```

### 3.4 Run as a systemd service

`/etc/systemd/system/pizza-denfert-api.service`:

```ini
[Unit]
Description=Pizza Denfert FastAPI
After=network.target mongod.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/pizza-denfert/backend
Environment="PATH=/opt/pizza-denfert/backend/.venv/bin"
ExecStart=/opt/pizza-denfert/backend/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/pizza-denfert
sudo systemctl daemon-reload
sudo systemctl enable --now pizza-denfert-api
```

### 3.5 Nginx reverse proxy

`/etc/nginx/sites-available/pizza-denfert`:

```nginx
server {
    listen 80;
    server_name pizzadenfert.fr www.pizzadenfert.fr;

    # Frontend (web build of the Expo app)
    root /opt/pizza-denfert/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    client_max_body_size 10M;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/pizza-denfert /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS via Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pizzadenfert.fr -d www.pizzadenfert.fr
```

### 3.6 Backup MongoDB

```bash
# Daily dump to /var/backups/mongo
sudo mkdir -p /var/backups/mongo
sudo crontab -e
# Add:
0 3 * * * mongodump --db=pizza_denfert --out=/var/backups/mongo/$(date +\%F) && find /var/backups/mongo -mtime +30 -delete
```

---

## Part 4 — Default test credentials (CHANGE BEFORE PRODUCTION)

On first start, the backend seeds one admin account:

- Email: `admin@pizzadenfert.fr`
- Password: `Admin1234!`
- Role: `owner` (default fallback)

**On a real deployment**, immediately:
1. Log in as the seeded admin.
2. Go to **Admin Panel → Personnel → Créer**.
3. Create a phone-based owner account for the real restaurant manager (they will sign in with phone + OTP).
4. Either disable or delete the `admin@pizzadenfert.fr` email account from the staff list.

---

## Part 5 — SMS provider for OTP (production)

In dev mode the backend returns the OTP `dev_code` in the JSON response. For
production, replace the `log.info(...)` line in `POST /api/auth/otp/request`
(`backend/server.py` around line 149) with a Twilio (or Vonage, OVH SMS, etc.)
send call. The integration playbook agent can wire Twilio in for you — just ask.

---

## Part 6 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Expo Go crashes with "Font file for feather is empty" | Old jsdelivr-based font loader was used | Already fixed — fonts now bundled via `Feather.font` |
| Admin scanner shows "camera unavailable" on web | Browsers cannot use `expo-camera` | Use an APK/IPA build for staff devices |
| `POST /api/admin/staff/create` returns 500 | Email index not partial → DuplicateKeyError on `email: null` | Already fixed on startup; ensure the new index migration ran |
| `POST /api/admin/search` returns 500 on `+33...` | Unescaped regex chars | Already fixed with `re.escape()` |
| OTP login works but no SMS sent | Dev mode — `dev_code` is in the JSON | Wire a real SMS provider (Part 5) |

---

## Part 7 — Cost summary (typical small-restaurant deployment)

| Item | One-time | Recurring |
|---|---|---|
| VPS (Hetzner CX21) | — | ~€5/mo |
| Domain (`pizzadenfert.fr`) | ~€15 | ~€15/yr |
| Let's Encrypt TLS | free | free |
| Expo / EAS Build (free tier) | — | free for ≤ 30 builds/mo |
| Google Play developer account | $25 | — |
| Apple Developer (if shipping iOS) | — | $99/yr |
| Twilio SMS (~200 OTPs/mo) | — | ~€5–10/mo |
| **Total** | **~€40 / $25** | **~€10–20/mo** |

This bypasses Emergent's recurring hosting fee if cost is a concern. You can
still keep developing inside Emergent and push to GitHub each time you ship.
