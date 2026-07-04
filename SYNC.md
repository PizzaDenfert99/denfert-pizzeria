# Repository Synchronisation Contract

Pizza Denfert is served by **two GitHub repositories** that MUST stay in
lock-step at the source-code level:

| Role | Repo | What lives here |
| --- | --- | --- |
| Customer app (public site + native app) | `PizzaDenfert99/denfert-pizzeria` (THIS repo) | `frontend/` (Expo customer app), `backend/` (mirror of the canonical FastAPI backend for local Emergent preview) |
| Loyalty / POS / Admin CMS | `PizzaDenfert99/pizza-denfert-loyalty` | `frontend/` (Expo loyalty/kiosk/CMS), `backend/` (**canonical** FastAPI backend — one source of truth), `deploy/` (Hetzner + Nginx + systemd scripts) |

## Single source of truth

- **`backend/server.py`** — the canonical copy lives in the loyalty repo.
  The copy in this repo exists **only** so the Emergent preview can spin up a
  local API. When the loyalty repo's backend changes, sync the file here on a
  `sync/*` branch and open a PR against `main`. Never edit the backend in
  isolation — the two must stay byte-for-byte identical.
- **`backend/requirements.txt`** — same rule.
- **Supabase project** — a single Supabase project (`fuxyinngmdzzoumloenv.supabase.co`)
  is consumed by both apps. Keys live only in each server's local `.env`.
- **MongoDB** — a single MongoDB running on the Hetzner VPS (bound to 127.0.0.1)
  is consumed by the shared backend.

## What lives in which repo — never duplicate

- The customer-facing Expo app lives ONLY in this repo.
- The loyalty/kiosk/admin Expo app lives ONLY in the loyalty repo.
- The backend exists as identical copies in both repos; only the loyalty repo
  is deployed to the VPS.
- Deploy scripts live only in the loyalty repo.

## Runtime configuration

- The customer app reads the API base URL from `EXPO_PUBLIC_BACKEND_URL`
  (see `frontend/.env` and `frontend/.env.example`).
- The default production value is `https://loyalty.pizzadenfert.fr`. CORS on
  that backend is open so requests from `pizzadenfert.fr` are accepted.
- Supabase configuration (anon key, URL) is provided via `EXPO_PUBLIC_SUPABASE_*`
  and is safe to expose in the client bundle (RLS enforces per-row access).

## Sync workflow

1. Change the code in the loyalty repo's `backend/`.
2. Create branch `sync/<short-description>` in both repos.
3. Copy the modified files into this repo's `backend/`.
4. Open a PR against `main` in each repo. Do **not** push directly to `main`.
5. Merge both PRs together to keep the repos in lock-step.
