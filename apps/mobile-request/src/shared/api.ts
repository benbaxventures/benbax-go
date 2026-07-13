import type { ApiErrorShape } from './types';

export type ApiResponse<T> =
  | {
      ok: true;
      data: T;
      meta?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: ApiErrorShape;
    };

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export const realtimeEvents = {
  deliveryRequested: 'delivery:requested',
  deliveryAssigned: 'delivery:assigned',
  deliveryUpdated: 'delivery:updated',
  trackingPoint: 'tracking:point',
  riderAvailability: 'rider:availability',
  riderOffer: 'rider:offer',
  riderWarning: 'rider:warning',
  // The API emits these ride events (see apps/api/src/realtime/events.ts).
  // Keys keep the carTrip* names the app already references; only the wire
  // strings must match the server, or live trip tracking never updates.
  carTripRequested: 'ride:requested',
  carTripAssigned: 'ride:assigned',
  carTripUpdated: 'ride:updated',
  carTripTrackingPoint: 'ride:tracking:point',
  driverAvailability: 'driver:availability',
  driverOffer: 'driver:offer',
  driverWarning: 'driver:warning',
  emergencyRaised: 'emergency:raised',
  adminAlert: 'admin:alert',
  chatMessage: 'chat:message',
  userPresence: 'user:presence',
} as const;
