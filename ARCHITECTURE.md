# Pizza Denfert — Architecture (post-2026-07 monorepo)

This document supersedes the previous two-repo `SYNC.md` contract. It reflects
the architectural direction adopted after the 2026-07 merge:

> **One repo owns the backend and the customer app. Every other client
> (kiosk tablet, QR scanner, admin panel) consumes the same backend via HTTPS.
> No business logic is ever duplicated.**

## Repositories

| Repository                                | Role                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `PizzaDenfert99/denfert-pizzeria` (this)  | **Single source of truth**. Owns the FastAPI backend, MongoDB schema, Supabase integration, the customer Expo app, and the admin/kiosk web routes. Deployed to the VPS via Docker. |
| `PizzaDenfert99/tablet-qr-scanner`        | Future thin client for in-restaurant tablets. Consumes this backend over HTTPS only — **no server code, no duplicated business logic**.                                          |
| `PizzaDenfert99/pizza-denfert-loyalty`    | Legacy — kept read-only for history. Its backend is now a byte-identical mirror; do not deploy from it.                                                                          |

## Runtime topology (self-hosted VPS)

```
                       Public internet
                              │
                              ▼
                    ┌─────────────────┐
                    │  nginx (Docker)  │   80 / 443 (TLS via Let's Encrypt)
                    └─┬────────────┬────┘
     api.pizzadenfert.fr │          │ loyalty.pizzadenfert.fr (legacy mirror)
                        ▼          ▼
                 ┌────────────────────────────┐
                 │   backend (Docker)   │   uvicorn @ :8001
                 │   FastAPI + Motor    │
                 └─┬──────────────────────┬────┘
                   │                    │
                   ▼                    ▼
           ┌───────────────┐    ┌────────────────────┐
           │  mongo (Docker) │    │ Supabase (SaaS)   │
           │  volume-backed  │    │ menu CMS + Storage│
           └───────────────┘    └────────────────────┘
```

Clients (all thin, all consume the same `/api/*` contract):
- Customer Expo app (`frontend/`) — web + iOS + Android from the same bundle.
- Admin / Kiosk web routes served by the customer app under `/admin`, `/admin-cms`, `/kiosk`, etc.
- `tablet-qr-scanner` (future repo) — pure Expo client, no backend code.

## Single-source-of-truth rules

1. **All business logic lives in `backend/server.py`.** Frontend and future
   `tablet-qr-scanner` code MUST NOT re-implement pricing, loyalty rules,
   reservation logic, staff permissions, or QR-code parsing.
2. **Menu / categories / restaurant settings live in Supabase.** The backend
   is authoritative for CMS writes and exposes `/api/menu/version` so any
   client can cheaply detect CMS changes.
3. **Users, reservations, loyalty points, and staff live in MongoDB.** Only
   the backend talks to Mongo directly; no client reaches Mongo.
4. **Auth flows** (email/password, Google OAuth, phone OTP) are handled by
   the backend. Clients only ever receive/send JWTs.

## Deployment (Docker on your own VPS)

See [`DEPLOY.md`](./DEPLOY.md) for the exact commands. TL;DR:

```bash
git clone https://github.com/PizzaDenfert99/denfert-pizzeria.git
cd denfert-pizzeria
cp .env.docker.example .env    # edit real values
# obtain TLS certs: see CERTS.md (scripts/cert-issue.sh) -- into nginx/certs/api.pizzadenfert.fr/ and
# nginx/certs/loyalty.pizzadenfert.fr/ (fullchain.pem + privkey.pem)
docker compose up -d --build
```

## Migration status — what's still to do

- [x] Merge loyalty codebase into this repo (2026-07).
- [x] Add `backend/Dockerfile`, `docker-compose.yml`, `nginx/nginx.conf`,
      `.env.docker.example`, and this document.
- [ ] Extract the tablet/kiosk UI (`frontend/app/kiosk.tsx`,
      `frontend/app/admin-cms/*`) into the `tablet-qr-scanner` repo. Once
      that repo is a thin API client, delete those routes from `frontend/`
      here.
- [ ] Archive `PizzaDenfert99/pizza-denfert-loyalty` (README pointer only).
- [ ] Add a GitHub Actions workflow that SSHes into the VPS, `git pull`s,
      and runs `docker compose up -d --build` on every push to `main`.
