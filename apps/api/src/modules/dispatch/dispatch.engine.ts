import type { DeliveryCategory } from '@prisma/client';

type Point = {
  latitude: number;
  longitude: number;
};

type CandidateRider = Point & {
  id: string;
  rating: number;
  activeDeliveries: number;
  lastLocationAgeSeconds: number;
};

const ACCRA_BASE_FARE_GHS = 18;

export function haversineKm(a: Point, b: Point) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function estimateDelivery(pickup: Point, dropoff: Point, category: DeliveryCategory) {
  const distanceKm = Math.max(1, Number(haversineKm(pickup, dropoff).toFixed(2)));
  const categoryMultiplier = category === 'FOOD' ? 1.12 : category === 'PHARMACY' ? 1.18 : 1;
  const estimatedMinutes = Math.ceil(distanceKm * 4.5 + 8);
  const baseFare = ACCRA_BASE_FARE_GHS;
  const serviceFee = 2.5;
  const surgeMultiplier = 1;
  const total = Number(
    (
      (baseFare + distanceKm * 3.5 + estimatedMinutes * 0.35 + serviceFee) *
      categoryMultiplier
    ).toFixed(2)
  );

  return {
    distanceKm,
    estimatedMinutes,
    baseFare,
    serviceFee,
    surgeMultiplier,
    total,
  };
}

export function estimateRide(pickup: Point, dropoff: Point, vehicleType = 'ECONOMY') {
  const distanceKm = Math.max(1, Number(haversineKm(pickup, dropoff).toFixed(2)));
  const estimatedMinutes = Math.ceil(distanceKm * 3.2 + 6);
  const baseFare = 20;
  const perKmFare = 4.2;
  const perMinuteFare = 0.45;
  const serviceFee = 0;
  const surgeMultiplier = 1;
  const vehicleMultiplier = vehicleType === 'COMFORT' ? 1.25 : vehicleType === 'SUV' ? 1.45 : 1;
  const total = Number(
    (
      (baseFare + distanceKm * perKmFare + estimatedMinutes * perMinuteFare + serviceFee) *
      surgeMultiplier *
      vehicleMultiplier
    ).toFixed(2)
  );

  return {
    distanceKm,
    estimatedMinutes,
    baseFare,
    perKmFare,
    perMinuteFare,
    surgeMultiplier,
    vehicleMultiplier,
    total,
  };
}

export function rankRiders(pickup: Point, candidates: CandidateRider[]) {
  return candidates
    .map((rider) => {
      const distanceKm = haversineKm(pickup, rider);
      const score =
        100 -
        distanceKm * 9 +
        rider.rating * 4 -
        rider.activeDeliveries * 12 -
        Math.min(rider.lastLocationAgeSeconds, 300) * 0.04;

      return {
        riderId: rider.id,
        distanceKm,
        score: Number(score.toFixed(2)),
      };
    })
    .sort((a, b) => b.score - a.score);
}
