# Pizza Denfert - PRD

## Overview
Premium dark-luxury digital menu & loyalty mobile app/PWA for **Pizza Denfert**, an artisanal Italo-French pizzeria at 61 Rue Denfert-Rochereau, 69004 Lyon, France. Primary use case: customers scan a QR code at their table to browse menu and earn rewards.

## Target Users
- Walk-in / dine-in customers scanning table QR codes
- Returning customers earning loyalty rewards
- Visitors wanting to book a table

## Brand
Dark luxury (black + gold/amber). Cinematic, Michelin-inspired Glass/Luxe DARK aesthetic.

## Tech Stack
- **Frontend**: Expo (React Native + Web), expo-router, expo-image, expo-blur, expo-linear-gradient, Feather icons. Languages: FR (default) / EN.
- **Backend**: FastAPI + MongoDB (motor). JWT + Emergent Google OAuth.
- **Routes**: 4 bottom tabs — Accueil, Menu, Réserver, Compte.

## Key Features
1. **Open by default** — no login wall. Menu and home are public.
2. **Digital Menu (7 categories)** — Pizzas, Focaccias, Gratins, Salades, Desserts, Boissons, Vins.
3. **Pizza dual pricing** — Each pizza shows 26 cm and 31 cm prices.
4. **Item detail** — Photo, description, ingredients, price for every dish.
5. **Reservations** — Date / time / guests / contact, works for guests OR logged-in users.
6. **Loyalty (in Account tab)** — Tracks pizzas purchased; rewards: 3 → café offert, 5 → dessert, 10 → Margherita. QR code in elegant gold VIP card. View available rewards + history.
7. **Auth in Compte tab only** — Email/password JWT + Emergent Google OAuth.
8. **Bilingual FR/EN** via in-app toggle.

## Removed (per latest user request)
- Online ordering / cart / checkout / Stripe (commerce disabled).
- "Notre Histoire", "wood-fired oven", "Quatre générations", "Ouvert 7j/7".
- Auth at app start (was previously gating the app).

## Backend Endpoints
- `POST /api/auth/{register,login,logout,google/session}`, `GET /api/auth/me`
- `GET /api/menu` (public)
- `POST /api/reservations` (auth) · `POST /api/reservations/guest` (public) · `GET /api/reservations/me`
- `GET /api/loyalty/me` · `POST /api/loyalty/add-purchase` · `POST /api/loyalty/redeem`

## Future
- Admin dashboard surface (endpoints exist).
- Real pizza-count increment via admin QR scan workflow.
- Push notifications (Emergent push, post-deploy only).
