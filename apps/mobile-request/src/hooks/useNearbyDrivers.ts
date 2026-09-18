import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/api';

export type NearbyDriver = {
  id: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  vehicleType?: string | null;
  name?: string;
};

/** Great-circle distance in km between two coordinates. */
export function distanceKmBetween(
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

export function useNearbyDrivers(
  latitude: number | null,
  longitude: number | null,
  isFocused = true
) {
  const enabled = isFocused && latitude != null && longitude != null;
  const query = enabled
    ? `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`
    : '';

  return useQuery({
    queryKey: ['nearby-drivers', latitude, longitude],
    queryFn: () => apiRequest<NearbyDriver[]>(`/drivers/nearby${query}`),
    enabled,
    refetchInterval: enabled ? 10_000 : false,
    staleTime: 5_000,
  });
}
