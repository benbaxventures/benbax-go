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
  emergencyRaised: 'emergency:raised',
  adminAlert: 'admin:alert',
  chatMessage: 'chat:message'
} as const;
