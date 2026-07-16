// Mirrors packages/shared/src/api.ts's realtimeEvents. Duplicated locally (not
// imported from @benbax/shared) so this app builds standalone when deployed
// from a subdirectory-only checkout (e.g. Vercel with Root Directory set to
// apps/admin, which does not upload the rest of the monorepo).
export const realtimeEvents = {
  deliveryRequested: 'delivery:requested',
  deliveryAssigned: 'delivery:assigned',
  deliveryUpdated: 'delivery:updated',
  trackingPoint: 'tracking:point',
  riderAvailability: 'rider:availability',
  riderOffer: 'rider:offer',
  riderWarning: 'rider:warning',
  rideRequested: 'ride:requested',
  rideAssigned: 'ride:assigned',
  rideUpdated: 'ride:updated',
  rideTrackingPoint: 'ride:tracking:point',
  driverAvailability: 'driver:availability',
  driverOffer: 'driver:offer',
  driverWarning: 'driver:warning',
  emergencyRaised: 'emergency:raised',
  adminAlert: 'admin:alert',
  chatMessage: 'chat:message',
  userPresence: 'user:presence',
  clientRegistered: 'client:registered',
  clientsNearby: 'clients:nearby',
  clientOnline: 'client:online',
  clientMoved: 'client:moved',
  clientOffline: 'client:offline',
} as const;
