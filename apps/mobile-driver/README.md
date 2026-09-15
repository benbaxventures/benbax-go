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

Important files

- `App.tsx` — app entry
- `app.config.js` — Expo config
- `android/` — native Android project

Contributing

Create issues or PRs. Follow existing code style and run linters/tests before submitting.

License

Add a license file if releasing this project publicly.
