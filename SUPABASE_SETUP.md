# Supabase CMS — Final Configuration (run AFTER implementation)

The Pizza Denfert app code is now fully wired for Supabase. You only need to
perform four configuration steps in your existing Supabase project to bring
the CMS live. **Do not paste any keys in chat.** Edit the `.env` files
directly via the file tree.

---

## Step 1 · Create the database schema, RLS, and storage bucket

1. Open https://app.supabase.com → your project → **SQL editor** → **New query**.
2. Open `/app/supabase/setup.sql` in this repo and copy its full contents.
3. Paste into the SQL editor and click **Run**.

The script is idempotent and creates:

| Object | What it does |
|---|---|
| `public.admins` | Whitelist of user IDs allowed to write to the CMS |
| `public.categories` | Menu categories (slug-unique) |
| `public.menu_items` | Menu items with `prices` JSON map + image_url |
| `public.restaurant_settings` | Single-row settings (phone, address, opening_hours JSON) |
| Storage bucket `menu-images` | **Public read**, admin-only write |
| RLS policies | Public can read active rows only; only `admins` table members can write |

Expected output: `Success. No rows returned`.

---

## Step 2 · Create your owner account and grant it admin rights

1. **Authentication → Users → Add user** → "Add user with email" → enter your
   owner email + a strong password.
2. *(Recommended)* **Authentication → Providers → Email** → uncheck
   "Enable email confirmations" so you can log in immediately.
3. Copy the new user's **UUID** (visible in the user list).
4. **SQL editor → New query** and run, replacing the UUID:
   ```sql
   insert into public.admins (user_id) values ('<paste-the-uuid-here>');
   ```

That user is now allowed to write to all CMS tables and upload menu photos.
Repeat the SQL insert for any additional staff you want to grant edit access.

---

## Step 3 · Configure the env vars (do NOT paste keys in chat)

Open **Settings → API** in Supabase. You will see `Project URL`, the
`anon public` key, and the `service_role` key.

### `/app/frontend/.env` — append these two safe-to-ship public values
```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<paste anon key>
```

### `/app/backend/.env` — append these two server-only values
```env
SUPABASE_URL=https://<your-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key>
```

> ⚠ `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. It must NEVER be added to
> the frontend or any `EXPO_PUBLIC_*` variable. The CMS frontend uses the
> anon key + Supabase Auth — RLS does the rest.

---

## Step 4 · Restart services

```bash
sudo supervisorctl restart backend expo
```

After restart:
- `/admin-cms` web route → log in with the owner account you just created → manage menu, categories and settings.
- The customer menu screen automatically switches from the FastAPI fallback to live Supabase data.
- If Supabase is ever unreachable, the customer menu transparently falls back to the FastAPI seed (no broken screen).

---

## Step 5 · (One-time, optional) Import the existing 21 menu items

The CMS dashboard ships with a **"Importer la carte initiale"** button on the
**Menu** tab — visible only when Supabase is empty. Clicking it:

1. Prompts you for the FastAPI admin password (`Admin1234!` by default).
2. The button hits `POST /api/admin/cms/seed-from-mongo` on the FastAPI
   backend, which uses your `SUPABASE_SERVICE_ROLE_KEY` server-side to bulk-
   upsert the 7 categories and 21 menu items (idempotent).
3. After it finishes, you can freely edit/delete/reorder from the CMS.

---

## Architecture summary

| Data | Storage | Reader | Writer |
|---|---|---|---|
| Menu / categories / settings | Supabase Postgres | anon key + RLS | admin via Supabase Auth |
| Menu photos | Supabase Storage `menu-images` (public) | public URL | admin via Supabase Auth |
| Loyalty / reservations / OTP / staff / QR codes | MongoDB (FastAPI) | FastAPI JWT | FastAPI JWT |

The customer Expo app talks directly to Supabase for menu reads (no FastAPI
hop, no cold-start latency) and continues to talk to FastAPI for everything
else. Two admin panels exist:
- **Native QR / Loyalty admin** (`/admin` in the native app) — FastAPI-backed.
- **Web CMS admin** (`/admin-cms`) — Supabase-backed, responsive on phone & desktop.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| CMS login says "Not an admin" | You forgot Step 2.4 — insert the UUID into `public.admins`. |
| Menu shows old MongoDB data after configuring env | Hard refresh the app (`Ctrl+Shift+R` on web). The Supabase fetch is still running — give it a couple of seconds. |
| Import button returns 503 | `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing in `/app/backend/.env`. |
| Photo upload returns 403 | The user is signed in but not in `admins`. Re-run Step 2.4. |
