# Architecture

## Product Modules

Benbax Go is split into four deployable systems:

| System | Responsibility |
| --- | --- |
| Customer mobile app | Registration, pickup/drop-off, Ghana landmark addressing, quotes, booking, tracking, wallet, support, history |
| Rider mobile app | Rider onboarding, KYC, online/offline mode, dispatch offers, navigation, earnings, delivery proof |
| Admin dashboard | Operations monitoring, rider/user management, revenue, pricing, geofences, support, fraud review |
| API platform | Auth, delivery lifecycle, dispatch, tracking, payments, notifications, support, admin APIs |

## Monorepo Layout

```text
apps/
  admin/
  api/
    prisma/
    src/
      config/
      middleware/
      modules/
      realtime/
      utils/
  mobile-customer/
  mobile-rider/
packages/
  shared/
docs/
```

## Backend Principles

- REST APIs for predictable mobile and dashboard operations.
- Socket.IO for live dispatch offers, rider tracking, chat, admin alerts, and emergency events.
- PostgreSQL as the source of truth with Prisma migrations.
- Redis for caching, idempotency keys, rate limits, location freshness, and dispatch queues.
- JWT access and refresh tokens with role-based authorization.
- Provider adapters for Paystack, MTN MoMo, Cloudinary, Firebase, and Google Maps.

## Mobile Principles

- Expo React Native with TypeScript.
- React Navigation for simple tab + stack navigation.
- Zustand for auth, drafts, rider availability, and current dispatch offers.
- TanStack Query for server state, caching, retries, loading states, and invalidation.
- NativeWind/Tailwind-ready styling with restrained visual tokens.
- React Native Maps for pickup/drop-off and tracking.
- Offline queue foundation for actions created during poor connectivity.

## Real-Time Flow

1. Customer creates delivery through REST.
2. Admin or automated job calls dispatch assignment.
3. API ranks active riders by proximity, rating, active workload, and GPS freshness.
4. Socket.IO emits `rider:offer` to the selected rider.
5. Rider accepts or rejects through REST.
6. Accepted deliveries emit `delivery:assigned` to customer/admin rooms.
7. Rider app streams tracking points through REST; API broadcasts `tracking:point`.
8. Admin dashboard subscribes to live rooms for monitoring and exceptions.

## Smart Landmark Addressing

The schema and UI support human-readable labels, Ghana-style landmarks, voice-note direction URLs, WhatsApp location URLs, contact details per stop, and saved locations.

## AI Delivery Assistant

The API includes an assistant module with a deterministic advice interface. In production, replace the internal suggestion map with a policy-controlled AI service that can predict ETA risk, suggest better address instructions, triage support, and recommend batching or routing improvements.

## Offline Resilience

Current scaffold includes a persisted offline queue. Production implementation should add connectivity detection, idempotency keys, background retry with backoff, local draft persistence, and conflict handling if pricing changes before sync.
