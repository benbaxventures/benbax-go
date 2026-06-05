# Deployment

## Local Development

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:request
npm run dev:rider
npm run dev:admin
```

## API Deployment

Recommended production baseline:

- Dockerized Node.js API.
- PostgreSQL managed database.
- Redis managed cache.
- Object storage or Cloudinary for media.
- Firebase Admin SDK for push notifications.
- Horizontal API scaling behind a load balancer.
- Sticky sessions or Redis adapter for Socket.IO when multiple API instances run.

## Mobile Deployment

- Use Expo EAS development builds for Firebase Cloud Messaging and native maps.
- Store Google Maps keys and Firebase config per app.
- Create separate customer and rider bundle identifiers.
- Use staged rollout for low-end Android device testing.

## Admin Deployment

- Build static Vite assets.
- Serve behind a CDN.
- Protect routes with admin auth and MFA.
- Restrict production admin domain through WAF rules where possible.

## CI/CD

The included GitHub Actions workflow performs:

- Install dependencies.
- Typecheck all workspaces.
- Build all buildable workspaces.

Production pipeline should add unit/integration tests, Prisma migration validation, Docker image scanning, EAS build workflows, and deployment approval gates.

## Scaling

- Use PostGIS and spatial indexes for large rider pools.
- Move dispatch into a queue-backed worker when assignment volume grows.
- Use event outbox for reliable webhooks, push notifications, and analytics.
- Partition tracking points by month or use TimescaleDB.
- Add analytics warehouse for investor and operations dashboards.
