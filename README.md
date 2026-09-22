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

Commands are written as `npm.cmd` / `npx.cmd` because PowerShell's default execution policy
(`Restricted`) refuses to load `npm.ps1` and fails with "running scripts is disabled on this
system". The `.cmd` shims skip the PowerShell wrapper and need no policy change. On macOS,
Linux, or Git Bash, drop the `.cmd`.

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

Admin login:

Staff access is a _second_ hat, not a different account. `User.role` says which app a
person works in — it owns their profile and their earnings — while `User.staffRole` grants
the dashboard on top of it. So one login can be a working driver in the partner app, a
passenger in the customer app, and an admin here, all at once. Granting staff access never
changes someone's operational role, and `requireRoles` accepts either hat.

No admin credentials are committed. Create an admin (or reset an admin's password)
against whatever database `DATABASE_URL` points at — you'll be prompted for the email,
phone and a password of at least 12 characters (not echoed), then asked to confirm:

```bash
npm.cmd run admin:set --workspace apps/api
```

Then sign in to the admin dashboard with that email (or phone) and password. The seed
script also creates `admin@benbax.com` using `SEED_ADMIN_PASSWORD` from the API env.

To provision the whole staff list in one pass — the `TEAM` array in
`apps/api/prisma/set-staff.ts`, where each entry is located by phone, email, or both:

```bash
npm.cmd run staff:set --workspace apps/api -- --dry-run
```

Always dry-run first: it prints the exact plan per account and writes nothing. Drop
`--dry-run` to apply. It prompts for one password (min 12 characters, not echoed), applies
it to every listed account, repairs any number stored in a non-E.164 shape, and signs out
existing sessions.

Two guards matter. Granting staff access to an account that does not already have it
requires `--promote`, and an entry matching more than one account aborts the whole run
rather than guessing which row to reset — a number with duplicate accounts must be resolved
by hand, or that entry keyed on something unique.

Order matters on a fresh deploy: the `staffRole` column arrives with a migration, which the
container applies on boot (`prisma migrate deploy` in the Dockerfile CMD). Deploy the API
before running `staff:set`, or apply it yourself with `npm.cmd run db:deploy --workspace
apps/api`. The migration backfills every existing staff account, so nobody loses access.

To give (or take away) dashboard access on its own, without resetting anyone's password:

```bash
npm.cmd run staff:grant --workspace apps/api -- someone@example.com
npm.cmd run staff:grant --workspace apps/api -- "059 820 4414" --role SUPPORT
npm.cmd run staff:grant --workspace apps/api -- someone@example.com --revoke
```

It writes `staffRole` and nothing else, so the account's role, password and profile survive
untouched — the same login keeps working in the customer and partner apps. A grant needs no
sign-out (a token refresh re-reads the account within ~15 minutes); a revoke ends every
session immediately.

Sign-in accepts a phone in any spelling (`059 417 2522`, `0594172522`, `+233594172522`) or
the account email. Where duplicate accounts share a number, typing an identifier exactly as
stored always wins; the email is the unambiguous way in.

Stored numbers converge on E.164 with:

```bash
npm.cmd run phones:check --workspace apps/api      # report only
npm.cmd run phones:normalize --workspace apps/api  # apply
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
