# Mobile UX And Design System

## UX Direction

Benbax should feel fast, trustworthy, and simple. The target user may be on a low-end Android device, on prepaid data, and under time pressure.

## Navigation

Customer app:

```text
Auth
Main tabs
  Home
  Orders
  Wallet
  Support
  Profile
Tracking stack screen
```

Rider app:

```text
Auth
Main tabs
  Dispatch
  Earnings
  KYC
  Profile
Active delivery stack screen
```

## Design Tokens

Shared tokens live in `packages/shared/src/design.ts`.

- Primary: `#0E7C66`
- Accent: `#FFB020`
- Ink: `#111827`
- Muted: `#5B6472`
- Canvas: `#F7F8FA`
- Border: `#D8DEE8`
- Standard radius: `8px`

## Customer Experience

- Start with pickup/drop-off, not marketing content.
- Category selection is lightweight and immediate.
- Ghana addressing supports landmarks, WhatsApp pin notes, and voice-note directions.
- Delivery quote appears before booking.
- Tracking prioritizes ETA, rider identity, OTP, call, and emergency controls.
- Empty order states explain what will appear without clutter.

## Rider Experience

- Online/offline control is prominent.
- Dispatch offer has accept/reject actions with no ambiguity.
- Active delivery screen focuses on route, navigation, proof, and OTP completion.
- Earnings and KYC are separate tabs to avoid crowding dispatch.

## Accessibility

- Use high contrast text and minimum 44px touch targets.
- Avoid dense animations on low-end Android devices.
- Use clear status labels and icons.
- Do not hide critical actions behind gestures.

## Performance

- Prefer simple native views over heavy visual layers.
- Keep map screens focused and avoid unnecessary overlays.
- Cache server data with TanStack Query.
- Queue critical actions offline, then sync with idempotency keys.
