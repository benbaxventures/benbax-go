# Benbax Request

The customer-facing mobile app for the [Benbax Go](../../README.md) delivery and logistics platform. Customers use it to place delivery orders, track them live, pay, top up a wallet, and manage their account.

Built with **Expo (SDK 55) / React Native 0.83 / React 19**, TypeScript, React Navigation, Zustand, TanStack Query, NativeWind, and Socket.IO.

> App identity: name **Benbax Request**, slug `benbax-request`, Android package `com.benbax.customer`, deep-link scheme `benbax://`.

## Features

- **Auth** — phone-or-email sign in, registration, Google Sign-In, biometric gate, and email-based password reset.
- **Deliveries** — create orders with pickup/drop-off locations, live map tracking, and order history.
- **Ride tracking** — trip tracking screens backed by realtime location points.
- **Payments** — Paystack card checkout and MTN Mobile Money via an in-app WebView.
- **Wallet** — balance, top-up via Paystack, and checkout verification.
- **Notifications** — push + in-app feed (Expo Notifications).
- **Support & profile** — support screen, editable profile, and privacy controls.
- **Resilience** — offline queue foundations, cold-start-aware API retries, OTA updates via `expo-updates`.

## Prerequisites

- Node.js `>= 20.19.0`
- A running Benbax API (see [`apps/api`](../api)) — locally on port `4000`, or the hosted default.
- For native builds: an [Expo/EAS](https://expo.dev) account and the EAS CLI.

## Getting started

All commands run from the **repository root** (this is an npm workspace — you do not need to `cd` into this folder).

```bash
npm install
npm run dev:request
```

Then scan the QR code with **Expo Go**, or press `a` to launch an Android emulator.

Other run modes:

```bash
npm run dev:request:phone    # LAN mode tuned for a physical device
npm run dev:request:tunnel   # ngrok tunnel (use when device and PC aren't on the same LAN)
```

## Environment configuration

The app reads `EXPO_PUBLIC_*` variables at build/start time. Create a `.env` in this folder (`apps/mobile-request/.env`) to override defaults. All are optional — sensible fallbacks exist.

| Variable                               | Purpose                               | Default                                 |
| -------------------------------------- | ------------------------------------- | --------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`             | REST API base URL                     | `https://benbax-go.onrender.com/api/v1` |
| `EXPO_PUBLIC_SOCKET_URL`               | Socket.IO origin                      | `https://benbax-go.onrender.com`        |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`      | Maps, geocoding, place names          | —                                       |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Google Sign-In (Android)              | built-in dev client id                  |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`     | Google Sign-In (web / token exchange) | built-in dev client id                  |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`     | Google Sign-In (iOS)                  | —                                       |

### Location names

[`src/services/placeName.ts`](src/services/placeName.ts) is the single place that turns coordinates
into text a passenger reads. Coordinates stay the source of truth for matching, distance, ETA and
navigation; only the display name comes from here.

It resolves in order — establishment/POI → nearby landmark → street → neighbourhood → city →
on-device geocoder → last good name → Plus Code → coordinates — so a passenger sees
"Church of Pentecost, Golf Estate" rather than `Q2X5+W2R`. Results are cached per ~55 m for
10 minutes and only re-resolved after ~120 m of real movement, and the Places landmark lookup only
runs when the cheaper Geocoding call found nothing recognisable.

The same `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` covers it, but the key needs these APIs enabled in
Google Cloud:

- **Geocoding API** — required for readable names (without it the app falls back to the coarser
  on-device geocoder, which is what produces Plus Codes on Android).
- **Places API** — optional; used only for the landmark fallback and for pickup/drop-off
  autocomplete.
- **Directions API** — used by the driver app's in-app navigation.

With no key at all the app still works: booking runs on latitude/longitude, and the pickup field
shows the best name the device can give.

### How the API URL is resolved

`resolveApiBaseUrl()` in [`src/services/network.ts`](src/services/network.ts) picks the backend automatically:

- If `EXPO_PUBLIC_API_BASE_URL` points at `localhost` or a private LAN IP, the app swaps in the **Expo dev host** at port `4000` — so a physical device talks to your dev machine's API without hardcoding your IP.
- Otherwise it uses the configured URL (or the hosted default).

The hosted default runs on Render's free tier, which cold-starts after inactivity; the API client allows a generous 60s timeout and retries idempotent GETs so a waking server still succeeds.

## Project structure

```
src/
├── App.tsx                 # Root: providers (QueryClient), navigation, splash, error boundary
├── components/             # Button, Screen, MapView, LocationInput, StatusPill, ErrorBoundary…
├── screens/                # One file per screen (SignIn, Home, Orders, Wallet, Tracking, Profile…)
├── navigation/             # RootNavigator + typed route params (types.ts)
├── hooks/                  # useDeliveries, useTrips, usePayments, useNotifications, useOfflineQueue…
├── services/               # api.ts (fetch client), network.ts (URL resolution), authStorage,
│                           #   realtime (Socket.IO), privacy, contact
├── store/                  # Zustand stores: authStore, deliveryStore, tripStore
├── shared/                 # Types, API contracts, and design tokens shared with the backend
├── theme/                  # Design tokens (colors, radius, spacing)
└── types/                  # env.d.ts (EXPO_PUBLIC_* declarations)
```

## Scripts

Run from this folder, or via the root wrappers noted above.

| Script                 | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `npm run start`        | Start the Expo dev server                          |
| `npm run start:phone`  | LAN mode for a physical device (PowerShell helper) |
| `npm run start:tunnel` | Tunnel mode with cache clear                       |
| `npm run android`      | Build & run the Android dev client                 |
| `npm run ios`          | Build & run on iOS                                 |
| `npm run web`          | Run in the browser                                 |
| `npm run typecheck`    | `tsc --noEmit`                                     |

### Builds & OTA updates (EAS)

From the repo root:

```bash
npm run request:build:dev          # development client (Android)
npm run request:build:preview      # internal preview build
npm run request:build:production   # production build
npm run request:update:preview     # push an OTA update to the preview channel
npm run request:update:production  # push an OTA update to the production channel
```

Before testing native features, verify the setup:

```bash
npx expo-doctor
```

## Related

- [Root README](../../README.md) — full platform overview and quick start
- [`apps/api`](../api) — backend the app talks to
- [`apps/mobile-driver`](../mobile-driver) — the partner (driver/rider) app
- [`apps/admin`](../admin) — operations dashboard
- Platform docs: [Architecture](../../docs/ARCHITECTURE.md) · [API](../../docs/API.md) · [Mobile UX](../../docs/MOBILE_UX.md) · [Security](../../docs/SECURITY.md)
