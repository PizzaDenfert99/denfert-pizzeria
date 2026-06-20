# Loyalty Tablet APK — Build & Install Guide

## What this APK is
A **standalone Android build** of the same monorepo, intended **only** for the in-restaurant counter tablet. It contains:

- ✅ Customer registration / phone-OTP login (`/account`)
- ✅ Loyalty card view (`/account` → Rewards tab)
- ✅ QR / barcode scanner (`/admin` → admin scanner)
- ✅ Loyalty admin (`/admin` quick actions on loyalty variant)
- ✅ Loyalty statistics (`/admin-stats`)
- ✅ Kiosk slideshow mode (`/kiosk`) — auto-launches after configured idle seconds (default 30 s)
- ✅ Advertising / slideshow management (`/admin-ads`)

**Excluded** (unreachable at runtime, hidden from the tab bar):

- ❌ Customer home (`/`)
- ❌ Menu browsing (`/menu`)
- ❌ Table reservations (`/reserve`)
- ❌ Main restaurant admin: reservations management, menu CMS, restaurant settings

## How the variant is selected

| | Main APK | Loyalty APK |
|--|--|--|
| App name | `Pizza Denfert` | `Pizza Denfert · Fidélité` |
| Android package | `fr.pizzadenfert.app` (default) | `fr.pizzadenfert.loyalty` |
| iOS bundle ID | `fr.pizzadenfert.app` (default) | `fr.pizzadenfert.loyalty` |
| `extra.variant` | `main` | `loyalty` |
| Idle → Kiosk auto-launch | ❌ | ✅ (30 s default) |
| Tab bar | Accueil · Menu · Réserver · Compte | Fidélité only |

The switch happens at build time via the `APP_VARIANT=loyalty` env variable set by the `production-loyalty-apk` EAS profile. `app.config.ts` reads this and overrides the name + package; `src/appMode.ts` reads `Constants.expoConfig.extra.variant` at runtime so route gating activates.

Because the package IDs are **different**, you can install the loyalty APK **alongside** the main customer APK on the same device without conflict.

## Build instructions

### Option A — Emergent **Publish** button (recommended)
The fastest path is the Publish workflow in the top-right of the Emergent console. When you trigger the Android build, select the build profile:

- `production-apk` → customer app
- **`production-loyalty-apk` → tablet loyalty app**

Emergent will:
1. Inject `APP_VARIANT=loyalty` into the build env (already wired in `eas.json`).
2. Build the APK with package `fr.pizzadenfert.loyalty` and name "Pizza Denfert · Fidélité".
3. Surface the download link in the Publish panel.

### Option B — Direct EAS CLI (if you have EAS access)
```bash
cd /app/frontend
yarn install
npx eas build --profile production-loyalty-apk --platform android
```

The CLI will prompt for your Expo credentials. Output is an APK download URL.

### Important pre-build checklist
- `EXPO_PUBLIC_BACKEND_URL` is hard-set in `eas.json` to `https://api.pizzadenfert.fr` for production-loyalty-apk — make sure that backend is live before installing.
- If you plan to use the **native push notifications** (admin alert when a reservation arrives), drop `google-services.json` into `/app/frontend/` and add `"googleServicesFile": "./google-services.json"` to `app.json` → `android` (currently not wired so builds work without Firebase). Loyalty APK alone doesn't need this — it's for the main admin push pipeline.

## Installing on the tablet

1. Plug the tablet into a computer (USB debugging enabled) or drop the APK on the tablet via Google Drive / USB transfer.
2. Open the APK file on the tablet → "Install from unknown source" prompt → confirm.
3. The icon will read **Pizza Denfert · Fidélité** with the same gold-on-black mark as the main app (swap the icon later if you want a different one — file is `/app/frontend/assets/images/icon.png`).
4. On first launch:
   - App opens directly into the **Fidélité** tab (loyalty card / login screen).
   - If no one touches the tablet for ~30 seconds, the **kiosk slideshow** auto-launches.
   - Tap anywhere on the slideshow → returns to the Fidélité screen.
   - Staff can reach the admin / scanner via the URL bar (in dev) or by adding a hidden long-press gesture (future enhancement). Today the most reliable path is: open the APK → navigate to `/admin` manually (deep link). On a kiosk-only tablet, we can hard-wire a "Staff access" button — let me know if you want this.

## Adjusting kiosk timing
The 30-second idle delay is admin-configurable from the Slideshow admin:
- Open the loyalty admin → **Diaporama publicitaire** → "Veille après (sec)" input → set any value 5–600 s.

## Files involved
- `frontend/app.config.ts` — dynamic Expo config (variant overrides)
- `frontend/eas.json` — `production-loyalty-apk` build profile
- `frontend/src/appMode.ts` — runtime variant detection
- `frontend/app/(tabs)/_layout.tsx` — tab bar gating (`href: null` on loyalty)
- `frontend/app/(tabs)/index.tsx` — `/` → `/kiosk` redirect on loyalty
- `frontend/app/kiosk.tsx` — tap-to-exit lands on `/account`

## Open question
We do not currently expose a visible "Admin login" entry point from the Fidélité tab on the loyalty APK — staff must type the path `/admin` manually. If you'd like a discreet button (e.g., a small gear icon in the top-right of the account tab that only renders on the loyalty variant), say the word and I'll add it before you cut the APK.
