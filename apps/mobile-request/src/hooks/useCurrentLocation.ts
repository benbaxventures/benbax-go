import { useCallback, useState } from 'react';

type LocationState = {
  latitude: number;
  longitude: number;
  label: string | null;
  address: string | null;
  nearbyName: string | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
};

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({
    latitude: 0,
    longitude: 0,
    label: null,
    address: null,
    nearbyName: null,
    loading: false,
    error: null,
    permissionDenied: false,
  });

  const requestLocation = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const Location = await import('expo-location');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setState((prev) => ({
          ...prev,
          loading: false,
          permissionDenied: true,
          error: 'Location permission denied',
        }));
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const nearbyName = place?.name || place?.street || place?.district || null;
      const addressParts = [
        place?.name,
        place?.street,
        place?.district,
        place?.city,
        place?.region,
        place?.country,
      ].filter(Boolean);
      const address = addressParts.join(', ') || null;
      const label = nearbyName || place?.city || address || 'Current location';

      setState({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label,
        address,
        nearbyName,
        loading: false,
        error: null,
        permissionDenied: false,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Could not get location',
      }));
    }
  }, []);

  return { ...state, requestLocation };
}
