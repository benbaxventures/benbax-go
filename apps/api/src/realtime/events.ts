export const realtimeEvents = {
  deliveryRequested: 'delivery:requested',
  deliveryAssigned: 'delivery:assigned',
  deliveryUpdated: 'delivery:updated',
  trackingPoint: 'tracking:point',
  riderAvailability: 'rider:availability',
  riderOffer: 'rider:offer',
  riderWarning: 'rider:warning',
  emergencyRaised: 'emergency:raised',
  adminAlert: 'admin:alert',
  chatMessage: 'chat:message'
} as const;
