import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/api';

export type NearbyDriver = {
  id: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  vehicleType?: string | null;
};

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
