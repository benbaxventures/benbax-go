# Mobile Driver (mobile-driver)

Mobile Driver is a React Native / Expo driver app for deliveries and ride services.

**Tech stack**

- React Native + Expo
- TypeScript
- Tailwind / NativeWind
- Android / iOS targets

## Quickstart

Prerequisites

- Node.js (16+)
- Yarn or npm
- Expo CLI (optional for development)

Install

```bash
cd apps/mobile-driver
yarn install
# or
# npm install
```

Start (development)

```bash
yarn start
# or
# expo start
```

Run on Android

```bash
yarn android
```

Run on iOS (macOS)

```bash
yarn ios
```

Build

- Android: follow `android/` Gradle setup (use `./gradlew`)
- iOS: configure via Xcode / EAS

Project structure (high level)

- `src/` — app source
- `src/components/` — UI components
- `src/hooks/` — custom hooks
- `src/screens/` — screens
- `services/` — network and native services

## Location names

`src/services/placeName.ts` turns coordinates into text a driver reads — "Church of Pentecost,
Golf Estate" rather than a Plus Code like `Q2X5+W2R`. It is a mirror of the customer app's
`apps/mobile-request/src/services/placeName.ts`, so both apps name the same spot identically;
keep the two files (and `placeText.ts`) in sync when changing either.

Coordinates remain the source of truth for dispatch, distance, ETA, navigation and geofencing.
Reverse geocoding only affects what is displayed, is cached per ~55 m for 10 minutes, and only
re-runs after ~120 m of real movement — a parked driver costs nothing.

Requires `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (also exposed as `expoConfig.extra.googleMapsApiKey`)
with the **Geocoding API** enabled; **Places API** is optional (landmark fallback) and
**Directions API** powers in-app navigation. Without a key the app falls back to the on-device
geocoder and still works.

Important files

- `App.tsx` — app entry
- `app.config.js` — Expo config
- `android/` — native Android project

Contributing

Create issues or PRs. Follow existing code style and run linters/tests before submitting.

License

Add a license file if releasing this project publicly.
