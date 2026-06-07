import { useCallback, useState } from 'react';

type LocationState = {
  latitude: number;
  longitude: number;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
};

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({
    latitude: 0,
    longitude: 0,
    loading: false,
    error: null,
    permissionDenied: false
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
          error: 'Location permission denied'
        }));
        return null;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      const nextLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      setState({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        loading: false,
        error: null,
        permissionDenied: false
      });
      return nextLocation;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Could not get location'
      }));
      return null;
    }
  }, []);

  return { ...state, requestLocation };
}
