# Benbax Go

Benbax Go is a production-oriented delivery, logistics, and ride-hailing platform scaffold for Ghana and wider African markets. It covers customer ordering, rider dispatch, driver ride dispatch, live tracking, admin operations, payments, notifications, geofencing, support, and trust controls.

## Apps

- `apps/mobile-request`: Expo React Native request app for placing delivery orders with TypeScript, React Navigation, Zustand, TanStack Query, NativeWind, maps, notifications, and offline queue foundations.
- `apps/mobile-driver`: Unified Expo React Native partner app for ride drivers and delivery riders with onboarding, KYC, online/offline mode, ride offers, delivery offers, active job tracking, earnings, wallet, and safety foundations.

- `apps/admin`: Vite React admin dashboard for operations, delivery monitoring, riders, users, pricing, geofences, support, and risk.
- `apps/api`: Node.js Express API with Prisma/PostgreSQL, Socket.IO, JWT auth, payments, notifications, dispatch, and tracking modules.
- `packages/shared`: Shared domain types, API contracts, real-time event names, and design tokens.

## Quick Start

```bash
npm.cmd install
cp .env.example .env
docker compose up -d postgres redis
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev:api
npm.cmd run dev:request
npm.cmd run dev:driver
npm.cmd run dev:admin
```

All app scripts are intended to run from the repository root. You do not need to `cd` into an app folder.

## Partner App

Run the unified Benbax Partner app from the repo root:

```bash
npm.cmd run dev:driver
```

For physical phone testing:

```bash
npm.cmd run dev:driver:phone
```

For tunnel mode:

```bash
npm.cmd run dev:driver:tunnel
```

The Partner app uses `com.benbax.driver` as its Android package name for update compatibility. It connects to ride-hailing routes for drivers and delivery routes for riders:

- Driver flow: `/api/v1/drivers`, `/api/v1/rides`, `/api/v1/ride-dispatch`, `/api/v1/tracking/rides/:tripId/points`
- Rider flow: `/api/v1/riders`, `/api/v1/deliveries`, `/api/v1/dispatch`, `/api/v1/tracking/deliveries/:deliveryId/points`

Before testing native partner features, verify the app setup:

```bash
cd apps/mobile-driver
npx.cmd expo-doctor
```

Local Expo testing supports core app navigation, auth, dispatch, foreground location, and KYC screens. Production/development builds include the configured native modules for location, document picking, image picking, maps, and OTA updates through `app.json`.

## Ride-Hailing Backend

Ride-hailing uses separate backend models and routes from delivery:

- `DriverProfile`, `DriverVehicle`, and `DriverKycDocument`
- `RideTrip`, `RideAssignment`, `RideTrackingPoint`, `RidePayment`, and `RideRating`
- `/api/v1/drivers`
- `/api/v1/rides`
- `/api/v1/ride-dispatch`
- `/api/v1/tracking/rides/:tripId/points`

After pulling or creating ride-hailing schema changes, run the database migration before testing the Partner app against the API:

```bash
docker compose up -d postgres redis
npm.cmd run db:deploy --workspace apps/api
```

For local development with new migrations, you can also use:

```bash
npm.cmd run db:migrate --workspace apps/api
```

Admin seed login:

```text
Phone: +233200000001
Password: BenbaxDemo123!
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database and ERD](docs/ERD.md)
- [API Surface](docs/API.md)
- [Mobile UX and Design System](docs/MOBILE_UX.md)
- [Security](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Product Strategy](docs/PRODUCT_STRATEGY.md)

## Notes

Expo SDK 55 is used for the mobile apps. It targets React Native 0.83 and React 19.2 according to the current Expo SDK reference, with SDK 55 bundled versions for maps, location, status bar, screens, gesture handler, and Reanimated.
