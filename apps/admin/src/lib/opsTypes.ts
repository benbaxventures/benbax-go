// Shapes returned by the /admin/ops/* endpoints (apps/api operations.routes.ts).

export type OpsOverview = {
  users: number;
  drivers: { total: number; live: number; busy: number; idle: number; staleOnline: number };
  riders: { total: number };
  passengersOnline: number;
  rides: {
    open: number;
    active: number;
    requestedToday: number;
    completedToday: number;
    cancelledToday: number;
    revenueTodayGhs: number;
  };
  deliveries: { active: number };
  revenueGhs: number;
};

export type LiveDriver = {
  userId: string;
  driverProfileId: string | null;
  name: string;
  phone: string | null;
  status: string;
  busy: boolean;
  activeTripId: string | null;
  rating: number | null;
  kycStatus: string | null;
  vehicle: {
    type: string;
    plateNumber: string | null;
    color: string | null;
    make: string | null;
  } | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  onlineSince: string;
  lastSeenAt: string;
};

export type LivePassenger = {
  userId: string;
  name: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  onlineSince: string;
  lastSeenAt: string;
  tripId: string | null;
  tripStatus: string | null;
};

export type OpsPresence = { drivers: LiveDriver[]; passengers: LivePassenger[] };

type DriverSummary = {
  id: string;
  userId: string;
  user: { name: string; phone: string };
  vehicle: {
    type: string;
    plateNumber: string | null;
    color: string | null;
    make: string | null;
  } | null;
};

export type OpsRide = {
  id: string;
  tripCode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  scheduledFor: string | null;
  ageMinutes: number;
  passenger: { id: string; name: string; phone: string };
  pickup: { label: string; latitude: number; longitude: number };
  dropoff: { label: string; latitude: number; longitude: number };
  fare: number;
  distanceKm: number;
  vehicleType: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  offers: { total: number; declined: number; lapsed: number };
  pendingOffer: { assignmentId: string; expiresAt: string; driver: DriverSummary } | null;
  driver: DriverSummary | null;
  driverPosition: { latitude: number; longitude: number; capturedAt: string } | null;
};

export type OpsRides = { open: OpsRide[]; active: OpsRide[]; recent: OpsRide[] };

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatKm(km: number) {
  if (!Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

export const RIDE_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Waiting',
  ASSIGNING: 'Offering',
  ASSIGNED: 'Driver en route',
  DRIVER_ARRIVING: 'Arriving',
  ARRIVED: 'At pickup',
  IN_PROGRESS: 'On trip',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};
