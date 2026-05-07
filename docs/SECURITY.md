# Security

## Authentication

- JWT access tokens are short-lived.
- Refresh tokens should be hashed and stored server-side before production launch.
- Role-based access control protects rider, customer, admin, support, and operations APIs.
- Production admin access should require MFA.

## Data Protection

- Store only necessary KYC metadata in the application database.
- Keep actual files in Cloudinary or a regulated object store with private access.
- Encrypt sensitive secrets with the cloud provider's secret manager.
- Do not log tokens, passwords, payment references, or KYC payloads.

## Payment Security

- Verify Paystack and MTN MoMo webhooks by signature or provider verification endpoint.
- Use idempotency keys for payment initialization and webhook processing.
- Reconcile cash-on-delivery with rider wallet settlement.
- Hold rider withdrawals when severe risk signals exist.

## Rider And Delivery Trust

- OTP delivery verification.
- Photo proof and optional recipient signature.
- Facial verification for onboarding and suspicious events.
- Emergency escalation channel to admin operations.
- GPS anomaly detection for impossible speeds, stale points, and route drift.

## API Hardening

- Add rate limits per IP, user, device, and route.
- Add request IDs and structured logs.
- Validate every request with Zod or DTO schemas.
- Add CORS allowlists per environment.
- Use Helmet and compression middleware.
- Run Prisma migrations through CI/CD, not manually in production shells.

## Fraud Signals

- Repeated OTP failures.
- High cancellation rates.
- Same device across many users.
- Payment refund abuse.
- GPS spoofing or stale GPS.
- Rider route divergence after pickup.
