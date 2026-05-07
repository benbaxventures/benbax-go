# API Surface

Base path: `/api/v1`

## Auth

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Register customer or rider |
| `POST` | `/auth/login` | Login and receive access/refresh tokens |
| `GET` | `/auth/me` | Current user profile |

## Deliveries

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/deliveries/quote` | Estimate distance, ETA, and fare |
| `POST` | `/deliveries` | Create delivery |
| `GET` | `/deliveries` | Customer delivery history |
| `GET` | `/deliveries/:id` | Delivery detail with tracking and assignment |
| `PATCH` | `/deliveries/:id/status` | Rider/admin status transition |

## Dispatch

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/dispatch/deliveries/:id/assign` | Assign best rider |
| `POST` | `/dispatch/assignments/:id/accept` | Rider accepts offer |
| `POST` | `/dispatch/assignments/:id/reject` | Rider rejects offer |

## Tracking

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/tracking/deliveries/:deliveryId/points` | Rider GPS point |
| `GET` | `/tracking/deliveries/:deliveryId/points` | Route replay |

## Riders

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/riders/me` | Rider profile |
| `PATCH` | `/riders/me/availability` | Online/offline and location update |
| `POST` | `/riders/me/kyc` | Submit KYC and vehicle info |

## Payments

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/payments/initialize` | Start MTN MoMo, Paystack, wallet, or COD payment |

Production additions:

- `POST /payments/webhooks/paystack`
- `POST /payments/webhooks/mtn-momo`
- `POST /payments/refunds`
- `POST /wallet/withdrawals`

## Notifications

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/notifications/device-tokens` | Register FCM token |
| `GET` | `/notifications` | User notification inbox |

## Admin

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/admin/dashboard` | Metrics summary |
| `GET` | `/admin/deliveries/live` | Active deliveries |

## Support, Geofences, Media, Assistant

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/support/tickets` | Open complaint or issue |
| `GET` | `/support/tickets` | Requester tickets |
| `GET` | `/geofences` | Active geofences |
| `POST` | `/geofences` | Admin creates geofence |
| `POST` | `/media/cloudinary-signature` | Signed upload parameters |
| `POST` | `/assistant/advice` | Smart ETA/address/support suggestions |

## Real-Time Events

| Event | Direction | Purpose |
| --- | --- | --- |
| `rider:offer` | API to rider | New dispatch offer |
| `delivery:assigned` | API to customer/admin | Rider accepted |
| `tracking:point` | API to customer/admin | New GPS point |
| `delivery:updated` | API to subscribers | Status changes |
| `emergency:raised` | API to admin | Safety escalation |
| `chat:message` | bidirectional | Delivery chat |
