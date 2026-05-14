# Benbax Go

Benbax Go is a production-oriented delivery and logistics platform scaffold for Ghana and wider African markets. It covers customer ordering, rider dispatch, live tracking, admin operations, payments, notifications, geofencing, support, and trust controls.

## Apps

- `apps/mobile-customer`: Expo React Native customer app with TypeScript, React Navigation, Zustand, TanStack Query, NativeWind, maps, notifications, and offline queue foundations.
- `apps/mobile-rider`: Expo React Native rider app with onboarding, KYC, online/offline mode, dispatch offers, earnings, route tracking, and proof workflow.
- `apps/admin`: Vite React admin dashboard for operations, delivery monitoring, riders, users, pricing, geofences, support, and risk.
- `apps/api`: Node.js Express API with Prisma/PostgreSQL, Socket.IO, JWT auth, payments, notifications, dispatch, and tracking modules.
- `packages/shared`: Shared domain types, API contracts, real-time event names, and design tokens.

## Quick Start

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:customer
npm run dev:rider
npm run dev:admin
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
