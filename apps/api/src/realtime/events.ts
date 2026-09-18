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
  // A targeted offer timed out or was withdrawn before the driver answered.
  driverOfferExpired: 'driver:offer:expired',
  driverWarning: 'driver:warning',
  // Open ride marketplace: every online driver sees every waiting request.
  rideOpen: 'ride:open',
  rideClosed: 'ride:closed',
  emergencyRaised: 'emergency:raised',
  adminAlert: 'admin:alert',
  chatMessage: 'chat:message',
  userPresence: 'user:presence',
  // A new passenger just registered on the request app (drivers are notified).
  clientRegistered: 'client:registered',
  // Live passenger-presence stream consumed by online drivers.
  clientsNearby: 'clients:nearby',
  clientOnline: 'client:online',
  clientMoved: 'client:moved',
  clientOffline: 'client:offline',
  // Live driver-presence stream consumed by online customers.
  driversNearby: 'drivers:nearby',
  driverOnline: 'driver:online',
  driverMoved: 'driver:moved',
  driverOffline: 'driver:offline',
} as const;
