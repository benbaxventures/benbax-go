import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  CheckCircle2,
  Crosshair,
  Flame,
  Home,
  Locate,
  Power,
  Users,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ClientOnlineToast } from '../components/ClientOnlineToast';
import { DriverMarker } from '../components/DriverMarker';
import { ErrorState } from '../components/ErrorState';
import { HotZoneOverlay } from '../components/HotZoneOverlay';
import { NearbyClientMarker } from '../components/NearbyClientMarker';
import { OfferMarker } from '../components/OfferMarker';
import { OfflineBanner } from '../components/OfflineBanner';
import { PriorityBadge } from '../components/PriorityBadge';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { useNearbyClients } from '../hooks/useNearbyClients';
import type { RootStackParamList } from '../navigation/types';
import { ApiConnectionError, apiRequest } from '../services/api';
import { useDriverStore } from '../store/driverStore';
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
  default: React.ComponentType<MapViewProps & { ref?: React.Ref<any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  Marker: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  MarkerAnimated: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  AnimatedRegion: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  Polyline: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

type HotZone = {
  id: string;
  center: { latitude: number; longitude: number };
  radius: number;
  demandLevel: 'high' | 'medium' | 'low';
  label?: string;
};

type PriorityData = {
  score: number;
  level: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  factors: Array<{ label: string; points: number; positive: boolean }>;
};

/** Camera tilt (degrees) that gives the map its 3D perspective, Yango-style. */
const MAP_PITCH_3D = 55;
/** Android uses `zoom`; iOS uses `altitude` (metres) — supply both. */
const MAP_CAMERA_ZOOM = 17;
const MAP_CAMERA_ALTITUDE = 600;

export function DispatchScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const {
    isOnline,
    setOnline,
    currentOffer,
    setCurrentOffer,
    earningMode,
    setEarningMode,
    headingHome,
    setHeadingHome,
    priority,
    setPriority,
    hotZones,
    setHotZones,
    maxPickupDistance,
  } = useDriverStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [is3D, setIs3D] = useState(true);
  const {
    latitude,
    longitude,
    heading,
    hasFix,
    loading: locationLoading,
    permissionDenied,
    requestLocation,
  } = useLiveLocation(true);
  const [mapsModule, setMapsModule] = useState<MapsModule | null>(null);
  const mapRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['42%', '90%'], []);

  // Live passengers coming online near the driver, streamed over the socket.
  const { nearbyClients, latestArrival, acknowledgeArrival } = useNearbyClients(isOnline, {
    latitude,
    longitude,
    radiusKm: maxPickupDistance,
  });

  useEffect(() => {
    loadMaps().then((m) => setMapsModule(m as unknown as MapsModule | null));
  }, []);

  // Pull the sheet up so the driver sees Accept/Reject the moment an offer lands.
  useEffect(() => {
    if (currentOffer) sheetRef.current?.snapToIndex(1);
  }, [currentOffer]);

  // Focus the map on the incoming request so pickup and dropoff are both visible.
  useEffect(() => {
    const coords = [currentOffer?.pickup, currentOffer?.dropoff].filter(
      (p): p is { latitude: number; longitude: number } => Boolean(p)
    );
    if (currentOffer && coords.length) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 180, right: 60, bottom: 420, left: 60 },
        animated: true,
      });
    }
  }, [currentOffer]);

  // Live countdown of the offer's acceptance window.
  const [offerSecondsLeft, setOfferSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!currentOffer?.expiresAt) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.round((new Date(currentOffer.expiresAt).getTime() - Date.now()) / 1000)
      );
      setOfferSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [currentOffer?.expiresAt]);

  const { data: priorityData } = useQuery<PriorityData>({
    queryKey: ['driver-priority'],
    queryFn: () => apiRequest('/drivers/me/priority'),
    enabled: isOnline,
    refetchInterval: 30000,
  });

  const { data: zones } = useQuery<HotZone[]>({
    queryKey: ['hot-zones'],
    queryFn: () => apiRequest('/drivers/me/hot-zones'),
    enabled: isOnline,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (priorityData) setPriority(priorityData);
  }, [priorityData, setPriority]);

  useEffect(() => {
    if (zones) setHotZones(zones);
  }, [zones, setHotZones]);

  const animateCameraTo = useCallback(
    (center: { latitude: number; longitude: number }, pitch: number) => {
      mapRef.current?.animateCamera(
        {
          center,
          pitch,
          heading: 0,
          zoom: MAP_CAMERA_ZOOM,
          altitude: MAP_CAMERA_ALTITUDE,
        },
        { duration: 500 }
      );
    },
    []
  );

  const recenter = useCallback(() => {
    const coords = latitude && longitude ? { latitude, longitude } : null;
    if (!coords) {
      requestLocation();
      return;
    }
    animateCameraTo(coords, is3D ? MAP_PITCH_3D : 0);
  }, [latitude, longitude, requestLocation, animateCameraTo, is3D]);

  const toggle3D = useCallback(() => {
    const next = !is3D;
    setIs3D(next);
    const coords = latitude && longitude ? { latitude, longitude } : null;
    if (coords) animateCameraTo(coords, next ? MAP_PITCH_3D : 0);
  }, [is3D, latitude, longitude, animateCameraTo]);

  const focusClient = useCallback(
    (client: { latitude: number; longitude: number }) => {
      animateCameraTo(client, is3D ? MAP_PITCH_3D : 0);
    },
    [animateCameraTo, is3D]
  );

  const toggleOnline = useCallback(async () => {
    setLoading(true);
    const next = !isOnline;
    setError(null);

    let coords = { latitude, longitude };
    if (!latitude && !longitude) {
      coords = (await requestLocation()) ?? coords;
    }

    const lat = coords.latitude;
    const lng = coords.longitude;

    if (next && (!lat || !lng)) {
      setError('Turn on location and tap the locate button before going online.');
      setLoading(false);
      return;
    }

    try {
      await apiRequest('/drivers/me/availability', {
        method: 'PATCH',
        body: JSON.stringify({
          isOnline: next,
          latitude: lat,
          longitude: lng,
          earningMode,
          maxPickupDistance: useDriverStore.getState().maxPickupDistance,
          headingHome,
          homeDestination: useDriverStore.getState().homeDestination,
        }),
      });
      setOnline(next);
    } catch (err) {
      if (err instanceof ApiConnectionError) {
        setError('Cannot reach the server. Check your internet connection and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not update availability.');
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline, latitude, longitude, requestLocation, setOnline, earningMode, headingHome]);

  const acceptOffer = useCallback(async () => {
    if (!currentOffer) return;
    setError(null);
    try {
      await apiRequest(`/ride-dispatch/assignments/${currentOffer.id}/accept`, { method: 'POST' });
      navigation.navigate('ActiveTrip', { tripId: currentOffer.tripId });
      setCurrentOffer(null);
    } catch (err) {
      if (err instanceof ApiConnectionError) {
        setError('Cannot reach the server. Check your connection.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not accept this offer.');
      }
    }
  }, [currentOffer, navigation, setCurrentOffer]);

  const rejectOffer = useCallback(async () => {
    if (!currentOffer) return;
    setError(null);
    try {
      await apiRequest(`/ride-dispatch/assignments/${currentOffer.id}/reject`, { method: 'POST' });
      setCurrentOffer(null);
    } catch (err) {
      if (err instanceof ApiConnectionError) {
        setError('Cannot reach the server. Check your connection.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not reject this offer.');
      }
    }
  }, [currentOffer, setCurrentOffer]);

  const toggleEarningMode = useCallback(async () => {
    const next = earningMode === 'efficient' ? 'flexible' : 'efficient';
    setEarningMode(next);
    if (isOnline) {
      try {
        await apiRequest('/drivers/me/earning-mode', {
          method: 'PATCH',
          body: JSON.stringify({ mode: next }),
        });
      } catch {
        setEarningMode(earningMode);
      }
    }
  }, [earningMode, isOnline, setEarningMode]);

  const toggleHeadingHome = useCallback(async () => {
    const next = !headingHome;
    setHeadingHome(next);
    if (isOnline) {
      try {
        await apiRequest('/drivers/me/pathfinder', {
          method: 'PATCH',
          body: JSON.stringify({
            headingHome: next,
            destination: latitude && longitude ? { latitude, longitude } : null,
          }),
        });
      } catch {
        setHeadingHome(headingHome);
      }
    }
  }, [headingHome, isOnline, setHeadingHome, latitude, longitude]);

  const MapView = mapsModule?.default;
  const Marker = mapsModule?.Marker;
  const MarkerAnimated = mapsModule?.MarkerAnimated;
  const AnimatedRegion = mapsModule?.AnimatedRegion;
  const canShowMap = Boolean(MapView && hasFix && latitude && longitude);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {/* Full-screen live map */}
      {canShowMap && MapView ? (
        <MapView
          ref={mapRef}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          initialCamera={{
            center: { latitude, longitude },
            pitch: is3D ? MAP_PITCH_3D : 0,
            heading: 0,
            zoom: MAP_CAMERA_ZOOM,
            altitude: MAP_CAMERA_ALTITUDE,
          }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsBuildings
          rotateEnabled
          pitchEnabled
          showsCompass={false}
        >
          {MarkerAnimated && AnimatedRegion ? (
            <DriverMarker
              MarkerAnimated={MarkerAnimated}
              AnimatedRegion={AnimatedRegion}
              latitude={latitude}
              longitude={longitude}
              heading={heading}
            />
          ) : null}
          {isOnline && Marker ? (
            <HotZoneOverlay zones={hotZones} MapView={MapView} Marker={Marker} />
          ) : null}
          {isOnline && Marker
            ? nearbyClients.map((client) => (
                <NearbyClientMarker key={client.id} client={client} Marker={Marker} />
              ))
            : null}
          {currentOffer?.pickup && Marker ? (
            <OfferMarker
              pickup={currentOffer.pickup}
              dropoff={currentOffer.dropoff}
              clientName={currentOffer.passengerName}
              offerType="ride"
              Marker={Marker}
              onPress={() => animateCameraTo(currentOffer.pickup!, is3D ? MAP_PITCH_3D : 0)}
            />
          ) : null}
        </MapView>
      ) : (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
          }}
        >
          {permissionDenied ? (
            <ErrorState
              title="Location needed"
              message="Benbax needs your location to show the map and match you with nearby trips."
              variant="offline"
              onRetry={requestLocation}
            />
          ) : (
            <>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                {locationLoading ? 'Finding your location…' : 'Starting map…'}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Floating header + recenter */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        pointerEvents="box-none"
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: theme.colors.canvas,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 20,
            ...theme.shadow,
          }}
        >
          <Image
            source={require('../../assets/benbax-logo.png') as number} // eslint-disable-line @typescript-eslint/no-require-imports
            style={{ width: 22, height: 22, borderRadius: 5 }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: 15, fontWeight: '900', color: theme.colors.ink }}>BENBAX</Text>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isOnline ? '#22C55E' : theme.colors.muted,
              marginLeft: 2,
            }}
          />
        </View>

        <View style={{ gap: 10, alignItems: 'flex-end' }}>
          <Pressable
            onPress={toggle3D}
            accessibilityRole="button"
            accessibilityLabel={is3D ? 'Switch to 2D map' : 'Switch to 3D map'}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: is3D ? theme.colors.primary : theme.colors.canvas,
              alignItems: 'center',
              justifyContent: 'center',
              ...theme.shadow,
            }}
          >
            <Box size={19} color={is3D ? '#fff' : theme.colors.primary} />
            <Text
              style={{
                position: 'absolute',
                bottom: 4,
                fontSize: 8,
                fontWeight: '900',
                color: is3D ? '#fff' : theme.colors.primary,
              }}
            >
              {is3D ? '3D' : '2D'}
            </Text>
          </Pressable>

          <Pressable
            onPress={recenter}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.colors.canvas,
              alignItems: 'center',
              justifyContent: 'center',
              ...theme.shadow,
            }}
          >
            <Locate size={20} color={theme.colors.primary} />
          </Pressable>
        </View>
      </View>

      {/* Live "passenger online" toast */}
      <ClientOnlineToast
        client={latestArrival}
        topInset={insets.top}
        onHide={acknowledgeArrival}
        onPress={focusClient}
      />

      {/* Control panel */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        backgroundStyle={{ backgroundColor: theme.colors.canvas }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24,
            gap: 14,
          }}
        >
          <OfflineBanner />

          {error ? <ErrorState message={error} compact variant="error" /> : null}

          {/* Current offer — shown first when present */}
          {currentOffer ? (
            <View
              style={{
                backgroundColor: theme.colors.primary + '12',
                borderWidth: 1,
                borderColor: theme.colors.primary,
                borderRadius: 12,
                padding: 16,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>
                  NEW RIDE REQUEST
                </Text>
                {offerSecondsLeft != null ? (
                  <Text style={{ color: '#DC2626', fontWeight: '900', fontSize: 13 }}>
                    {offerSecondsLeft}s
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: theme.colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                    {(currentOffer.passengerName || 'P').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 15 }}>
                  {currentOffer.passengerName || 'Passenger'}
                </Text>
              </View>
              {currentOffer.pickup?.label ? (
                <Text style={{ color: theme.colors.ink, fontSize: 13 }} numberOfLines={2}>
                  Pickup: {currentOffer.pickup.label}
                </Text>
              ) : null}
              {currentOffer.dropoff?.label ? (
                <Text style={{ color: theme.colors.muted, fontSize: 13 }} numberOfLines={2}>
                  Dropoff: {currentOffer.dropoff.label}
                </Text>
              ) : null}
              <Text style={{ color: theme.colors.muted }}>Match score {currentOffer.score}</Text>
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
            </View>
          ) : null}

          {/* Online/Offline toggle */}
          <Pressable
            onPress={toggleOnline}
            style={{
              backgroundColor: isOnline ? theme.colors.primary : theme.colors.surface,
              borderRadius: 12,
              padding: 18,
              gap: 6,
              borderWidth: isOnline ? 0 : 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Power size={26} color={isOnline ? '#fff' : theme.colors.primary} />
              <Text
                style={{
                  color: isOnline ? '#fff' : theme.colors.ink,
                  fontSize: 22,
                  fontWeight: '900',
                }}
              >
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
            <Text style={{ color: isOnline ? '#D7FFF5' : theme.colors.muted }}>
              {loading
                ? 'Updating…'
                : isOnline
                  ? 'Receiving nearby trip requests'
                  : 'Tap to go online and receive trips'}
            </Text>
          </Pressable>

          {/* Priority badge */}
          <PriorityBadge
            priority={priority}
            onPress={() => navigation.navigate('PriorityDetails')}
          />

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
              <Text
                style={{
                  color: earningMode === 'efficient' ? '#fff' : theme.colors.muted,
                  fontSize: 10,
                }}
              >
                Weekly bonuses
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
              <Text
                style={{
                  color: earningMode === 'flexible' ? '#fff' : theme.colors.muted,
                  fontSize: 10,
                }}
              >
                Lower fee, destinations shown
              </Text>
            </Pressable>
          </View>

          {/* Pathfinder toggle */}
          <Pressable
            onPress={toggleHeadingHome}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: 10,
              backgroundColor: headingHome ? '#8B5CF615' : theme.colors.surface,
              borderWidth: 1,
              borderColor: headingHome ? '#8B5CF6' : theme.colors.border,
            }}
          >
            <Home size={20} color={headingHome ? '#8B5CF6' : theme.colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 14 }}>
                Pathfinder
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                {headingHome
                  ? 'Finding trips on your way home'
                  : 'Head home with trips along the way'}
              </Text>
            </View>
            <View
              style={{
                width: 44,
                height: 26,
                borderRadius: 13,
                backgroundColor: headingHome ? '#8B5CF6' : theme.colors.border,
                justifyContent: 'center',
                paddingHorizontal: 3,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: '#fff',
                  alignSelf: headingHome ? 'flex-end' : 'flex-start',
                }}
              />
            </View>
          </Pressable>

          {/* Live nearby clients */}
          {isOnline ? (
            <Pressable
              onPress={() => {
                const first = nearbyClients[0];
                if (first) focusClient(first);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                borderRadius: 8,
                backgroundColor: '#22C55E12',
              }}
            >
              <Users size={16} color="#16A34A" />
              <Text style={{ color: theme.colors.ink, fontSize: 12, flex: 1 }}>
                {nearbyClients.length > 0
                  ? `${nearbyClients.length} ${nearbyClients.length === 1 ? 'passenger' : 'passengers'} online nearby — tap to view`
                  : 'Watching for passengers coming online nearby…'}
              </Text>
            </Pressable>
          ) : null}

          {/* Hot zones legend */}
          {isOnline && hotZones.length > 0 ? (
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
                {hotZones.length} hot {hotZones.length === 1 ? 'zone' : 'zones'} nearby — drive
                there for more requests
              </Text>
            </View>
          ) : null}

          {/* Location status */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}
          >
            <Crosshair size={12} color={theme.colors.muted} />
            <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
              {locationLoading
                ? 'Locating…'
                : latitude && longitude
                  ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                  : 'Location unavailable'}
            </Text>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}
