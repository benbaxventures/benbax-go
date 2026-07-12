import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Bike, CheckCircle2, Crosshair, Flame, Power, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { HotZoneOverlay } from '../components/HotZoneOverlay';
import { OfflineBanner } from '../components/OfflineBanner';
import { Screen } from '../components/Screen';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import type { RootStackParamList } from '../navigation/types';
import { ApiConnectionError, apiRequest } from '../services/api';
import { useDriverStore } from '../store/driverStore';
import { useRiderStore } from '../store/riderStore';
import { theme } from '../theme/tokens';

async function loadMaps() {
  try {
    const maps = await import('react-native-maps');
    return maps;
  } catch {
    return null;
  }
}

import type { MapViewProps } from 'react-native-maps';

type MapsModule = {
  default: React.ComponentType<MapViewProps>;
  Marker: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  Polyline: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

type HotZone = {
  id: string;
  center: { latitude: number; longitude: number };
  radius: number;
  demandLevel: 'high' | 'medium' | 'low';
  label?: string;
};

export function DeliveryDispatchScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { isOnline, setOnline, currentOffer, setCurrentOffer } = useRiderStore();
  const { earningMode, setEarningMode, maxPickupDistance } = useDriverStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { latitude, longitude, loading: locationLoading, requestLocation } = useCurrentLocation();
  const [mapsModule, setMapsModule] = useState<MapsModule | null>(null);
  const MapView = mapsModule?.default;
  const Marker = mapsModule?.Marker;

  useEffect(() => {
    loadMaps().then(setMapsModule);
  }, []);

  const { data: hotZones } = useQuery<HotZone[]>({
    queryKey: ['hot-zones'],
    queryFn: () => apiRequest('/drivers/me/hot-zones'),
    enabled: isOnline,
    refetchInterval: 60000,
  });

  const toggleOnline = useCallback(async () => {
    setLoading(true);
    const next = !isOnline;
    setError(null);

    if (latitude === 0 && longitude === 0) {
      await requestLocation();
    }

    const lat = latitude || 5.6508;
    const lng = longitude || -0.1668;

    try {
      await apiRequest('/riders/me/availability', {
        method: 'PATCH',
        body: JSON.stringify({
          isOnline: next,
          latitude: lat,
          longitude: lng,
          earningMode,
          maxPickupDistance,
        }),
      });
      setOnline(next);
    } catch (err) {
      if (err instanceof ApiConnectionError) {
        setError('Cannot reach the server. Check your internet connection and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not update delivery availability.');
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline, latitude, longitude, requestLocation, setOnline, earningMode, maxPickupDistance]);

  const acceptOffer = useCallback(async () => {
    if (!currentOffer) return;
    setError(null);
    try {
      await apiRequest(`/dispatch/assignments/${currentOffer.id}/accept`, { method: 'POST' });
      navigation.navigate('ActiveDelivery', { deliveryId: currentOffer.deliveryId });
      setCurrentOffer(null);
    } catch (err) {
      if (err instanceof ApiConnectionError) {
        setError('Cannot reach the server. Check your connection.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not accept this delivery offer.');
      }
    }
  }, [currentOffer, navigation, setCurrentOffer]);

  const rejectOffer = useCallback(async () => {
    if (!currentOffer) return;
    setError(null);
    try {
      await apiRequest(`/dispatch/assignments/${currentOffer.id}/reject`, { method: 'POST' });
      setCurrentOffer(null);
    } catch (err) {
      if (err instanceof ApiConnectionError) {
        setError('Cannot reach the server. Check your connection.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not reject this delivery offer.');
      }
    }
  }, [currentOffer, setCurrentOffer]);

  const toggleEarningMode = useCallback(async () => {
    const next = earningMode === 'efficient' ? 'flexible' : 'efficient';
    setEarningMode(next);
    if (isOnline) {
      try {
        await apiRequest('/riders/me/earning-mode', {
          method: 'PATCH',
          body: JSON.stringify({ mode: next }),
        });
      } catch {
        setEarningMode(earningMode);
      }
    }
  }, [earningMode, isOnline, setEarningMode]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {isOnline && MapView && Marker && latitude && longitude ? (
        <MapView
          style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          initialCamera={{
            center: { latitude, longitude },
            pitch: 55,
            heading: 0,
            zoom: 15,
            altitude: 800,
          }}
          showsUserLocation
          showsMyLocationButton={false}
          showsBuildings
          rotateEnabled
          pitchEnabled
        >
          <HotZoneOverlay zones={hotZones ?? []} MapView={MapView} Marker={Marker} />
        </MapView>
      ) : null}

      <Screen>
        <OfflineBanner />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image
            source={require('../../assets/benbax-logo.png') as number} // eslint-disable-line @typescript-eslint/no-require-imports
            style={{ width: 28, height: 28, borderRadius: 6 }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.ink }}>BENBAX</Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.ink }}>
            Delivery dispatch
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            Go online to receive parcel, food, courier, and pharmacy delivery offers.
          </Text>
        </View>

        {error ? <ErrorState message={error} compact variant="error" /> : null}

        {/* Earning mode toggle */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.colors.surface,
            borderRadius: 10,
            padding: 4,
            gap: 4,
          }}
        >
          <Pressable
            onPress={toggleEarningMode}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor: earningMode === 'efficient' ? theme.colors.accent : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: earningMode === 'efficient' ? '#fff' : theme.colors.muted,
                fontWeight: '800',
                fontSize: 13,
              }}
            >
              Efficient
            </Text>
          </Pressable>
          <Pressable
            onPress={toggleEarningMode}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor: earningMode === 'flexible' ? theme.colors.primary : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: earningMode === 'flexible' ? '#fff' : theme.colors.muted,
                fontWeight: '800',
                fontSize: 13,
              }}
            >
              Flexible
            </Text>
          </Pressable>
        </View>

        {/* Location */}
        <Pressable
          onPress={requestLocation}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 12,
            alignSelf: 'flex-start',
            borderRadius: 6,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Crosshair size={14} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
            {locationLoading
              ? 'Detecting...'
              : latitude && longitude
                ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                : 'Update location'}
          </Text>
        </Pressable>

        {/* Online/Offline toggle */}
        <Pressable
          onPress={toggleOnline}
          style={{
            backgroundColor: isOnline ? theme.colors.primary : theme.colors.surface,
            borderRadius: 8,
            padding: 18,
            gap: 8,
            borderWidth: isOnline ? 0 : 1,
            borderColor: theme.colors.border,
          }}
        >
          <Power size={26} color={isOnline ? '#fff' : theme.colors.primary} />
          <Text
            style={{ color: isOnline ? '#fff' : theme.colors.ink, fontSize: 24, fontWeight: '900' }}
          >
            {isOnline ? 'Online for deliveries' : 'Offline for deliveries'}
          </Text>
          <Text style={{ color: isOnline ? '#D7FFF5' : theme.colors.muted }}>
            {loading ? 'Updating...' : 'Tap to change delivery availability'}
          </Text>
        </Pressable>

        {/* Hot zones legend */}
        {isOnline && hotZones && hotZones.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              borderRadius: 8,
              backgroundColor: '#8B5CF610',
            }}
          >
            <Flame size={16} color="#8B5CF6" />
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              {hotZones.length} hot {hotZones.length === 1 ? 'zone' : 'zones'} nearby
            </Text>
          </View>
        )}

        {/* Current offer */}
        <View
          style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Bike size={18} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>
              Current delivery offer
            </Text>
          </View>
          {currentOffer ? (
            <>
              <Text style={{ color: theme.colors.muted }}>Delivery {currentOffer.deliveryId}</Text>
              <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
                Dispatch score {currentOffer.score}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Accept"
                    icon={<CheckCircle2 size={18} color="#fff" />}
                    onPress={acceptOffer}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Reject"
                    icon={<XCircle size={18} color="#fff" />}
                    onPress={rejectOffer}
                    variant="danger"
                  />
                </View>
              </View>
            </>
          ) : (
            <Text style={{ color: theme.colors.muted }}>
              No active delivery offer. Fresh GPS and high completion rate improve matching.
            </Text>
          )}
        </View>
      </Screen>
    </View>
  );
}
