# Pizza Denfert - PRD

## Overview
Premium dark-luxury digital menu & loyalty mobile app/PWA for **Pizza Denfert**, an artisanal Italo-French pizzeria at 61 Rue Denfert-Rochereau, 69004 Lyon, France. Primary use case: customers scan a QR code at their table to browse menu and earn rewards.

## Brand
Dark luxury (black + gold). Real Pizza Denfert logo integrated (saved at `/app/frontend/assets/images/logo.png` + icon.png + splash-icon.png + adaptive-icon.png).

## Tech Stack
- **Frontend**: Expo (React Native + Web), expo-router, expo-image, expo-blur, expo-linear-gradient.
- **Backend**: FastAPI + MongoDB (motor). JWT + Emergent Google OAuth.
- **Routes**: 4 bottom tabs — Accueil, Menu, Réserver, Compte.

## Key Features
1. **Open by default** — no login wall. Menu, Home, Reservation are public.
2. **Auth only in Compte tab** — Email/password JWT + Emergent Google OAuth.
3. **Digital Menu (7 categories)** — Pizzas, Focaccias, Gratins, Salades, Desserts, Boissons, Vins.
4. **Pizza dual pricing** — 26 cm and 31 cm prices for each pizza.
5. **Each item shows** photo, description, ingredients, price.
6. **Reservations** — Public + authenticated. Date / time / guests / contact.
7. **Loyalty (in Account)** — Tracks pizzas purchased; rewards: 3 → café · 5 → dessert · 10 → Margherita. QR code in elegant gold VIP card. View points + available rewards + history.
8. **Bilingual FR/EN** via in-app toggle.

## Removed (per latest user request)
- Online ordering / cart / checkout / Stripe.
- "Notre Histoire", "wood-fired oven", "Quatre générations", "Ouvert 7j/7" — all gone.
- "PD" placeholder logo — replaced with official Pizza Denfert logo.
- Demo customer account seed.
- Demo hint on auth screen.

## Restaurant Presentation Text (current)
FR: "Pizza Denfert allie farine française traditionnelle, produits locaux de la région Rhône-Alpes et savoir-faire italien authentique pour créer des pizzas artisanales uniques, inspirées des traditions culinaires françaises et italiennes."

## Backend Endpoints
- `POST /api/auth/{register,login,logout,google/session}`, `GET /api/auth/me`
- `GET /api/menu` (public)
- `POST /api/reservations` (auth) · `POST /api/reservations/guest` (public) · `GET /api/reservations/me`
- `GET /api/loyalty/me` · `POST /api/loyalty/add-purchase` · `POST /api/loyalty/redeem`

## Notes
- Google session token now stored idempotently via upsert (fixes duplicate-key 500).
- Logo also installed as iOS/Android splash + adaptive icons.

## Future
- Admin scan-pizza workflow to increment loyalty.
- Online ordering re-enable (Stripe wiring code already exists in git history).
- Push notifications (Emergent push, post-deploy).

