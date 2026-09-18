import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Box,
  Car,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Flame,
  Home,
  Locate,
  Power,
  Users,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ClientDetailCard } from '../components/ClientDetailCard';
import { ClientOnlineToast } from '../components/ClientOnlineToast';
import { DriverMarker } from '../components/DriverMarker';
import { ErrorState } from '../components/ErrorState';
import { HotZoneOverlay } from '../components/HotZoneOverlay';
import { NearbyClientMarker } from '../components/NearbyClientMarker';
import { OfferMarker } from '../components/OfferMarker';
import { OfflineBanner } from '../components/OfflineBanner';
import { PriorityBadge } from '../components/PriorityBadge';
import { RequestPickupMarker } from '../components/RequestPickupMarker';
import { formatKm, RideRequestCard, timeAgo } from '../components/RideRequestCard';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { useNearbyClients } from '../hooks/useNearbyClients';
import { useOpenRideRequests } from '../hooks/useOpenRideRequests';
import type { RootStackParamList } from '../navigation/types';
import { ApiConnectionError, apiRequest } from '../services/api';
import {
  fetchDrivingRoute,
  haversineMeters,
  openExternalNavigation,
  type RouteCoordinate,
} from '../services/directions';
import { acquireSharedSocket, emitDriverLocation, releaseSharedSocket } from '../services/realtime';
import { acceptRide, AcceptRideError } from '../services/rides';
import { useAuthStore } from '../store/authStore';
import type { NearbyClient, OpenRideRequest } from '../store/driverStore';
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

/** Collapsed list sizes in the control panel; "Show all" expands them. */
const REQUESTS_PREVIEW_COUNT = 3;
const CLIENTS_PREVIEW_COUNT = 5;
/** Re-fetch the driving route at most this often while navigating. */
const ROUTE_REFRESH_MS = 30_000;

/** Where in-app navigation is currently heading. */
type NavTarget = {
  kind: 'client' | 'pickup' | 'dropoff';
  /** Passenger id for `client`, trip id for `pickup`/`dropoff`. */
  id: string;
  /** Passenger to follow live / notify, when known. */
  clientId?: string;
  label: string;
  latitude: number;
  longitude: number;
};

const NAV_TITLES: Record<NavTarget['kind'], string> = {
  client: 'Passenger',
  pickup: 'Pickup',
  dropoff: 'Drop-off',
};

export function DispatchScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const driverId = useAuthStore((s) => s.user?.id);
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
  } = useDriverStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [is3D, setIs3D] = useState(true);
  const [navTarget, setNavTarget] = useState<NavTarget | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[]>([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState(0);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState(0);
  const [hasArrived, setHasArrived] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [acceptingTripId, setAcceptingTripId] = useState<string | null>(null);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [showAllClients, setShowAllClients] = useState(false);
  const lastPublishedLocationRef = useRef({ at: 0, latitude: 0, longitude: 0 });
  const lastRouteFetchRef = useRef({ at: 0, latitude: 0, longitude: 0, targetKey: '' });
  const activeTripId = useDriverStore((s) => s.activeTripId);
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

  // Every passenger online nationwide, streamed over the socket. The same
  // hook heart-beats this driver's live position to the server.
  const { nearbyClients, latestArrival, acknowledgeArrival } = useNearbyClients(isOnline, {
    latitude,
    longitude,
    heading,
  });

  // Every ride request waiting for a driver, nationwide. Any of them can be
  // accepted from here; the first driver to accept gets the passenger.
  const {
    requests: openRequests,
    refresh: refreshOpenRequests,
    remove: removeOpenRequest,
  } = useOpenRideRequests(isOnline, { latitude, longitude });

  const requestByPassenger = useMemo(
    () => new Map(openRequests.map((r) => [r.passengerId, r])),
    [openRequests]
  );

  // A request tapped on the map jumps to the top of the list so its card is visible.
  const orderedRequests = useMemo(() => {
    const selected = openRequests.find((r) => r.tripId === selectedRequestId);
    return selected
      ? [selected, ...openRequests.filter((r) => r.tripId !== selectedRequestId)]
      : openRequests;
  }, [openRequests, selectedRequestId]);

  const distanceFromDriverKm = useCallback(
    (point: { latitude: number; longitude: number }) =>
      latitude || longitude
        ? Math.round(haversineMeters({ latitude, longitude }, point) / 100) / 10
        : null,
    [latitude, longitude]
  );

  // Nearest first, with passengers who are actually requesting a ride on top.
  const sortedClients = useMemo(() => {
    return nearbyClients
      .map((client) => ({ client, distanceKm: distanceFromDriverKm(client) }))
      .sort((a, b) => {
        const aReq = requestByPassenger.has(a.client.id) ? 0 : 1;
        const bReq = requestByPassenger.has(b.client.id) ? 0 : 1;
        if (aReq !== bReq) return aReq - bReq;
        return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      });
  }, [nearbyClients, requestByPassenger, distanceFromDriverKm]);

  const selectedClient = nearbyClients.find((c) => c.id === selectedClientId) ?? null;

  // Keep the customer-facing nearby-driver map current while an online driver
  // moves, without sending an availability request for every GPS callback.
  useEffect(() => {
    if (!isOnline || !latitude || !longitude) return;

    const now = Date.now();
    const previous = lastPublishedLocationRef.current;
    const moved =
      Math.abs(latitude - previous.latitude) >= 0.0002 ||
      Math.abs(longitude - previous.longitude) >= 0.0002;
    if (!moved && now - previous.at < 10_000) return;

    lastPublishedLocationRef.current = { at: now, latitude, longitude };
    void apiRequest('/drivers/me/availability', {
      method: 'PATCH',
      body: JSON.stringify({ isOnline: true, latitude, longitude }),
    }).catch(() => undefined);
  }, [isOnline, latitude, longitude]);

  // When heading to a passenger, follow their live position as they move.
  const liveNavClient =
    navTarget?.kind === 'client'
      ? (nearbyClients.find((client) => client.id === navTarget.id) ?? null)
      : null;
  const navDestination = navTarget
    ? liveNavClient
      ? { latitude: liveNavClient.latitude, longitude: liveNavClient.longitude }
      : { latitude: navTarget.latitude, longitude: navTarget.longitude }
    : null;

  // The waiting request behind the current navigation target, if it is still
  // open — lets the driver accept without leaving navigation.
  const navRequest = navTarget
    ? navTarget.kind === 'client'
      ? requestByPassenger.get(navTarget.id)
      : openRequests.find((r) => r.tripId === navTarget.id)
    : undefined;

  const defaultSnapPoints = useMemo(() => ['42%', '90%'], []);
  const navSnapPoints = useMemo(() => ['14%', '42%', '90%'], []);
  const snapPoints = navTarget ? navSnapPoints : defaultSnapPoints;

  const stopNavigation = useCallback(() => {
    setNavTarget(null);
    setRouteCoordinates([]);
    setHasArrived(false);
    lastRouteFetchRef.current = { at: 0, latitude: 0, longitude: 0, targetKey: '' };
    sheetRef.current?.snapToIndex(0);
  }, []);

  const startNavigation = useCallback(
    async (target: NavTarget) => {
      if (!latitude || !longitude) {
        requestLocation();
        return;
      }
      setNavTarget(target);
      setHasArrived(false);
      sheetRef.current?.snapToIndex(0);
      const route = await fetchDrivingRoute(
        { latitude, longitude },
        { latitude: target.latitude, longitude: target.longitude }
      );
      lastRouteFetchRef.current = {
        at: Date.now(),
        latitude,
        longitude,
        targetKey: `${target.latitude.toFixed(4)},${target.longitude.toFixed(4)}`,
      };
      setRouteCoordinates(route.coordinates);
      setRouteDistanceMeters(route.distanceMeters);
      setRouteDurationSeconds(route.durationSeconds);
      mapRef.current?.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 170, right: 45, bottom: 240, left: 45 },
        animated: true,
      });
    },
    [latitude, longitude, requestLocation]
  );

  // While heading to a passenger, keep a shared socket open so they get the
  // "driver is on the way" alert and see this car approach in real time.
  const navSocketRef = useRef<ReturnType<typeof acquireSharedSocket> | null>(null);
  const navClientId = navTarget?.kind === 'client' ? navTarget.id : null;
  useEffect(() => {
    if (!navClientId) return;
    const socket = acquireSharedSocket();
    navSocketRef.current = socket;
    socket.emit('navigation:start', { clientId: navClientId });
    return () => {
      navSocketRef.current = null;
      releaseSharedSocket();
    };
  }, [navClientId]);

  // Live distance/ETA, arrival detection, and position updates to the passenger.
  useEffect(() => {
    if (!navTarget || !navDestination || !latitude || !longitude || !driverId) return;
    const distance = haversineMeters({ latitude, longitude }, navDestination);
    const speedMetersPerSecond = Math.max(heading >= 0 ? 8.3 : 5.5, 1);
    setRouteDistanceMeters(distance);
    setRouteDurationSeconds(distance / speedMetersPerSecond);

    if (distance < 50 && !hasArrived) {
      setHasArrived(true);
    }

    if (navTarget.kind === 'client') {
      emitDriverLocation(navSocketRef.current, {
        driverId,
        clientId: navTarget.id,
        latitude,
        longitude,
        bearing: heading,
        eta: Math.ceil(distance / speedMetersPerSecond),
      });
    }
    // navDestination is derived each render; its primitives are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    driverId,
    heading,
    latitude,
    longitude,
    navTarget,
    navDestination?.latitude,
    navDestination?.longitude,
    hasArrived,
  ]);

  // Refresh the drawn route when the driver strays or the passenger moves —
  // not on every GPS tick, which would burn through Directions API quota.
  useEffect(() => {
    if (!navTarget || !navDestination || !latitude || !longitude) return;
    const last = lastRouteFetchRef.current;
    const targetKey = `${navDestination.latitude.toFixed(4)},${navDestination.longitude.toFixed(4)}`;
    const movedMeters = haversineMeters(last, { latitude, longitude });
    const due = Date.now() - last.at >= ROUTE_REFRESH_MS;
    if (targetKey === last.targetKey && !(due && movedMeters > 100)) return;
    lastRouteFetchRef.current = { at: Date.now(), latitude, longitude, targetKey };
    fetchDrivingRoute({ latitude, longitude }, navDestination).then((route) => {
      setRouteCoordinates(route.coordinates);
      setRouteDistanceMeters(route.distanceMeters);
      setRouteDurationSeconds(route.durationSeconds);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, navTarget, navDestination?.latitude, navDestination?.longitude]);

  const navigateToClient = useCallback(
    (client: NearbyClient) =>
      void startNavigation({
        kind: 'client',
        id: client.id,
        clientId: client.id,
        label: client.name ?? 'Passenger',
        latitude: client.latitude,
        longitude: client.longitude,
      }),
    [startNavigation]
  );

  const navigateToRequest = useCallback(
    (request: OpenRideRequest, leg: 'pickup' | 'dropoff' = 'pickup') => {
      const point = leg === 'pickup' ? request.pickup : request.dropoff;
      void startNavigation({
        kind: leg,
        id: request.tripId,
        clientId: request.passengerId,
        label: point.label,
        latitude: point.latitude,
        longitude: point.longitude,
      });
    },
    [startNavigation]
  );

  const openTrip = useCallback(
    (tripId: string) => {
      stopNavigation();
      navigation.navigate('ActiveTrip', { tripId });
    },
    [navigation, stopNavigation]
  );

  /**
   * Accept a ride — the targeted offer (assignmentId) or any open request —
   * and go straight to the trip screen with navigation to the pickup.
   */
  const handleAccept = useCallback(
    async (tripId: string, assignmentId?: string) => {
      if (acceptingTripId) return;
      setError(null);
      setAcceptingTripId(tripId);
      try {
        await acceptRide({ tripId, ...(assignmentId ? { assignmentId } : {}) });
        removeOpenRequest(tripId);
        setSelectedClientId(null);
        setSelectedRequestId(null);
        setCurrentOffer(null);
        useDriverStore.getState().setActiveTripId(tripId);
        openTrip(tripId);
      } catch (err) {
        if (err instanceof AcceptRideError && err.kind === 'busy' && err.activeTripId) {
          const busyTripId = err.activeTripId;
          Alert.alert('Finish your current trip', err.message, [
            { text: 'Resume trip', onPress: () => openTrip(busyTripId) },
            { text: 'OK', style: 'cancel' },
          ]);
        } else if (err instanceof AcceptRideError && err.kind === 'taken') {
          removeOpenRequest(tripId);
          if (useDriverStore.getState().currentOffer?.tripId === tripId) setCurrentOffer(null);
          Alert.alert('Ride no longer available', err.message);
        } else {
          setError(err instanceof Error ? err.message : 'Could not accept this ride.');
        }
        void refreshOpenRequests();
      } finally {
        setAcceptingTripId(null);
      }
    },
    [acceptingTripId, openTrip, refreshOpenRequests, removeOpenRequest, setCurrentOffer]
  );

  const selectClient = useCallback((client: NearbyClient) => {
    setSelectedClientId(client.id);
    setSelectedRequestId(null);
    sheetRef.current?.snapToIndex(1);
    mapRef.current?.animateCamera(
      { center: { latitude: client.latitude, longitude: client.longitude } },
      { duration: 500 }
    );
  }, []);

  const selectRequest = useCallback((request: OpenRideRequest) => {
    setSelectedRequestId(request.tripId);
    setSelectedClientId(null);
    sheetRef.current?.snapToIndex(1);
    mapRef.current?.fitToCoordinates([request.pickup, request.dropoff], {
      edgePadding: { top: 180, right: 60, bottom: 420, left: 60 },
      animated: true,
    });
  }, []);

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
    const offerId = currentOffer.id;
    const tick = () => {
      const left = Math.max(
        0,
        Math.round((new Date(currentOffer.expiresAt).getTime() - Date.now()) / 1000)
      );
      setOfferSecondsLeft(left);
      // Time's up: the offer moves to another driver, but the ride stays in
      // the open list below so this driver can still grab it if it's free.
      if (left === 0) {
        const latest = useDriverStore.getState().currentOffer;
        if (latest?.id === offerId) setCurrentOffer(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOffer?.id, currentOffer?.expiresAt]);

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

  const acceptOffer = useCallback(() => {
    if (!currentOffer) return;
    void handleAccept(currentOffer.tripId, currentOffer.id);
  }, [currentOffer, handleAccept]);

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
  const Polyline = mapsModule?.Polyline;
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
          {navTarget && navDestination && Marker ? (
            <Marker
              coordinate={navDestination}
              title={`${NAV_TITLES[navTarget.kind]}: ${navTarget.label}`}
              pinColor={navTarget.kind === 'dropoff' ? '#EF4444' : '#F59E0B'}
            />
          ) : null}
          {navTarget && Polyline && routeCoordinates.length > 1 ? (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={theme.colors.primary}
              strokeWidth={5}
            />
          ) : null}
          {isOnline && Marker ? (
            <HotZoneOverlay zones={hotZones} MapView={MapView} Marker={Marker} />
          ) : null}
          {isOnline && Marker
            ? nearbyClients.map((client) => (
                <NearbyClientMarker
                  key={client.id}
                  client={client}
                  Marker={Marker}
                  onPress={selectClient}
                />
              ))
            : null}
          {isOnline && Marker
            ? openRequests
                .filter((request) => request.tripId !== currentOffer?.tripId)
                .map((request) => (
                  <RequestPickupMarker
                    key={request.tripId}
                    request={request}
                    selected={request.tripId === selectedRequestId}
                    Marker={Marker}
                    onPress={selectRequest}
                  />
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
        {navTarget ? (
          <Pressable
            onPress={stopNavigation}
            accessibilityRole="button"
            accessibilityLabel="Exit navigation"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: theme.colors.canvas,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 22,
              ...theme.shadow,
            }}
          >
            <ArrowLeft size={18} color={theme.colors.ink} />
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>Back to panel</Text>
          </Pressable>
        ) : (
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
        )}

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

      {navTarget ? (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 76,
            left: 16,
            right: 16,
            backgroundColor: hasArrived ? '#22C55E' : theme.colors.canvas,
            borderRadius: 16,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            ...theme.shadow,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: hasArrived ? '#fff' : theme.colors.ink,
                fontSize: 16,
                fontWeight: '900',
              }}
              numberOfLines={1}
            >
              {hasArrived
                ? `Arrived at ${NAV_TITLES[navTarget.kind].toLowerCase()}!`
                : `${NAV_TITLES[navTarget.kind]}: ${navTarget.label}`}
            </Text>
            {!hasArrived && (
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                {routeDistanceMeters >= 1000
                  ? `${(routeDistanceMeters / 1000).toFixed(1)} km`
                  : `${Math.round(routeDistanceMeters)} m`}{' '}
                · {Math.max(1, Math.ceil(routeDurationSeconds / 60))} min away
                {liveNavClient ? ' · live' : ''}
              </Text>
            )}
          </View>
          {navDestination ? (
            <Pressable
              onPress={() => void openExternalNavigation(navDestination)}
              accessibilityRole="button"
              accessibilityLabel="Open turn-by-turn navigation in Google Maps"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                backgroundColor: hasArrived ? 'rgba(255,255,255,0.25)' : theme.colors.primary,
              }}
            >
              <ExternalLink size={14} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Maps</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Live "passenger online" toast */}
      <ClientOnlineToast
        client={latestArrival}
        topInset={insets.top}
        onHide={acknowledgeArrival}
        onPress={(client) => {
          focusClient(client);
          selectClient(client);
        }}
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
          {/* Collapsed navigation bar while navigating */}
          {navTarget ? (
            <View
              style={{
                padding: 12,
                borderRadius: 12,
                backgroundColor: hasArrived ? '#22C55E18' : theme.colors.primary + '12',
                borderWidth: 1,
                borderColor: hasArrived ? '#22C55E' : theme.colors.primary,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: hasArrived ? '#22C55E' : theme.colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>
                    {navTarget.label.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 14 }}
                    numberOfLines={1}
                  >
                    {hasArrived ? 'Arrived!' : `${NAV_TITLES[navTarget.kind]}: ${navTarget.label}`}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                    {hasArrived
                      ? `You are at the ${NAV_TITLES[navTarget.kind].toLowerCase()}`
                      : routeDistanceMeters >= 1000
                        ? `${(routeDistanceMeters / 1000).toFixed(1)} km · ${Math.max(1, Math.ceil(routeDurationSeconds / 60))} min`
                        : `${Math.round(routeDistanceMeters)} m · ${Math.max(1, Math.ceil(routeDurationSeconds / 60))} min`}
                  </Text>
                </View>
                <Pressable
                  onPress={stopNavigation}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 14,
                    backgroundColor: hasArrived ? '#22C55E' : theme.colors.primary,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                    {hasArrived ? 'Done' : 'End nav'}
                  </Text>
                </Pressable>
              </View>
              {navRequest ? (
                <Button
                  label={`Accept ride · GHS ${navRequest.fare.toFixed(2)}`}
                  icon={<CheckCircle2 size={18} color="#fff" />}
                  onPress={() => void handleAccept(navRequest.tripId)}
                  loading={acceptingTripId === navRequest.tripId}
                />
              ) : null}
            </View>
          ) : null}

          <OfflineBanner />

          {error ? <ErrorState message={error} compact variant="error" /> : null}

          {/* Unfinished trip — always one tap away */}
          {activeTripId ? (
            <Pressable
              onPress={() => openTrip(activeTripId)}
              accessibilityRole="button"
              accessibilityLabel="Resume your active trip"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 14,
                borderRadius: 12,
                backgroundColor: theme.colors.primary,
              }}
            >
              <Car size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
                  Trip in progress
                </Text>
                <Text style={{ color: '#D7FFF5', fontSize: 12 }}>
                  Tap to resume navigation and trip actions
                </Text>
              </View>
              <ChevronRight size={20} color="#fff" />
            </Pressable>
          ) : null}

          {/* Full control panel — hidden during navigation */}
          {!navTarget ? (
            <>
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
                  <Text style={{ color: theme.colors.ink, fontWeight: '700' }}>
                    {currentOffer.fare != null ? `GHS ${currentOffer.fare.toFixed(2)}` : ''}
                    {currentOffer.pickup
                      ? `${currentOffer.fare != null ? ' · ' : ''}${formatKm(distanceFromDriverKm(currentOffer.pickup))} to pickup`
                      : ''}
                    {currentOffer.tripDistanceKm != null
                      ? ` · ${formatKm(currentOffer.tripDistanceKm)} trip`
                      : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Accept"
                        icon={<CheckCircle2 size={18} color="#fff" />}
                        onPress={acceptOffer}
                        loading={acceptingTripId === currentOffer.tripId}
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

              {/* Selected passenger — live details, request, and navigation */}
              {isOnline && selectedClient ? (
                <ClientDetailCard
                  client={selectedClient}
                  distanceKm={distanceFromDriverKm(selectedClient)}
                  request={requestByPassenger.get(selectedClient.id)}
                  accepting={acceptingTripId === requestByPassenger.get(selectedClient.id)?.tripId}
                  onAccept={(request) => void handleAccept(request.tripId)}
                  onNavigate={(kind) => {
                    const request = requestByPassenger.get(selectedClient.id);
                    if (kind === 'client' || !request) navigateToClient(selectedClient);
                    else navigateToRequest(request, kind);
                  }}
                  onClose={() => setSelectedClientId(null)}
                />
              ) : null}

              {/* Ride requests waiting for a driver — nationwide */}
              {isOnline ? (
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Car size={16} color="#B45309" />
                    <Text style={{ flex: 1, color: theme.colors.ink, fontWeight: '900' }}>
                      Ride requests{openRequests.length ? ` (${openRequests.length})` : ''}
                    </Text>
                    {openRequests.length > REQUESTS_PREVIEW_COUNT ? (
                      <Pressable onPress={() => setShowAllRequests((v) => !v)} hitSlop={8}>
                        <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>
                          {showAllRequests ? 'Show less' : 'Show all'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {openRequests.length === 0 ? (
                    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                      No one is waiting right now. New requests from anywhere in the country appear
                      here instantly.
                    </Text>
                  ) : (
                    (showAllRequests
                      ? orderedRequests
                      : orderedRequests.slice(0, REQUESTS_PREVIEW_COUNT)
                    ).map((request) => (
                      <RideRequestCard
                        key={request.tripId}
                        request={request}
                        highlighted={request.tripId === selectedRequestId}
                        accepting={acceptingTripId === request.tripId}
                        disabled={acceptingTripId != null}
                        onAccept={(r) => void handleAccept(r.tripId)}
                        onNavigate={(r) => navigateToRequest(r, 'pickup')}
                        onPress={selectRequest}
                      />
                    ))
                  )}
                </View>
              ) : null}

              {/* Passengers online — nationwide, live */}
              {isOnline ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Users size={16} color="#16A34A" />
                    <Text style={{ flex: 1, color: theme.colors.ink, fontWeight: '900' }}>
                      Passengers online{nearbyClients.length ? ` (${nearbyClients.length})` : ''}
                    </Text>
                    {sortedClients.length > CLIENTS_PREVIEW_COUNT ? (
                      <Pressable onPress={() => setShowAllClients((v) => !v)} hitSlop={8}>
                        <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>
                          {showAllClients ? 'Show less' : 'Show all'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {sortedClients.length === 0 ? (
                    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                      Watching for passengers coming online anywhere in the country…
                    </Text>
                  ) : (
                    (showAllClients
                      ? sortedClients
                      : sortedClients.slice(0, CLIENTS_PREVIEW_COUNT)
                    ).map(({ client, distanceKm }) => {
                      const request = requestByPassenger.get(client.id);
                      return (
                        <Pressable
                          key={client.id}
                          onPress={() => selectClient(client)}
                          accessibilityRole="button"
                          accessibilityLabel={`View ${client.name ?? 'passenger'} details`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                            padding: 10,
                            borderRadius: 10,
                            backgroundColor:
                              client.id === selectedClientId
                                ? theme.colors.primary + '14'
                                : theme.colors.surface,
                          }}
                        >
                          <View
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 15,
                              backgroundColor: request ? '#F59E0B' : '#22C55E',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                              {(client.name ?? 'P').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 13 }}
                              numberOfLines={1}
                            >
                              {client.name ?? 'Passenger'}
                            </Text>
                            <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
                              {formatKm(distanceKm)} away · online {timeAgo(client.since)}
                            </Text>
                          </View>
                          {request ? (
                            <View
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 10,
                                backgroundColor: '#F59E0B22',
                              }}
                            >
                              <Text style={{ color: '#B45309', fontWeight: '800', fontSize: 11 }}>
                                Wants a ride
                              </Text>
                            </View>
                          ) : null}
                          <ChevronRight size={16} color={theme.colors.muted} />
                        </Pressable>
                      );
                    })
                  )}
                </View>
              ) : null}

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
                    backgroundColor:
                      earningMode === 'efficient' ? theme.colors.accent : 'transparent',
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
                    backgroundColor:
                      earningMode === 'flexible' ? theme.colors.primary : 'transparent',
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
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'center',
                }}
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
            </>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}
