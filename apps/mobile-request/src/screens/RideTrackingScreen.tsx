import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Car, MapPinned, MessageSquareText, Phone } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import type { RootStackParamList } from '../navigation/types';
import { apiRequest } from '../services/api';
import { BENBAX_PHONE, callPhone, openWhatsApp } from '../services/contact';
import { createRealtimeClient } from '../services/realtime';
import { realtimeEvents } from '../shared';
import { theme } from '../theme/tokens';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type DriverInfo = {
  user?: { name?: string; fullName?: string; phone?: string };
  vehicle?: {
    type?: string;
    plateNumber?: string | null;
    color?: string | null;
    make?: string | null;
    model?: string | null;
  };
  currentLatitude?: string | number | null;
  currentLongitude?: string | number | null;
};

type RideDetail = {
  id: string;
  tripCode: string;
  status: string;
  scheduledFor?: string | null;
  pickupLabel: string;
  pickupLatitude: string;
  pickupLongitude: string;
  dropoffLabel: string;
  dropoffLatitude: string;
  dropoffLongitude: string;
  metadata?: {
    expectedRoute?: {
      polyline?: Coordinate[];
    };
  };
  trackingPoints?: Array<{
    latitude: string;
    longitude: string;
  }>;
  assignments?: Array<{
    status: string;
    driverProfile?: DriverInfo;
  }>;
};

type RideAssignmentEvent = {
  tripId: string;
  status: string;
  driverProfile?: DriverInfo;
};

type Props = NativeStackScreenProps<RootStackParamList, 'RideTracking'>;

function LazyRideMap({
  pickup,
  dropoff,
  latestPoint,
  routePoints,
}: {
  pickup: Coordinate;
  dropoff: Coordinate;
  latestPoint: Coordinate | null;
  routePoints: Coordinate[];
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modulesRef = useRef<{
    MapView: any;
    Marker: any;
    Polyline: any;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import('react-native-maps');
        modulesRef.current = {
          MapView: mod.default,
          Marker: mod.Marker,
          Polyline: mod.Polyline,
        };
        setLoaded(true);
      } catch {
        setError('Map view is not available on this device.');
      }
    })();
  }, []);

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          borderRadius: 8,
          backgroundColor: theme.colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: theme.colors.muted }}>{error}</Text>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View
        style={{
          flex: 1,
          borderRadius: 8,
          backgroundColor: theme.colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const { MapView, Marker, Polyline } = modulesRef.current!;
  return (
    <MapView
      style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}
      initialRegion={{
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      }}
    >
      <Marker coordinate={pickup} title="Pickup" />
      <Marker coordinate={dropoff} title="Destination" />
      {latestPoint ? (
        <Marker coordinate={latestPoint} title="Driver" pinColor={theme.colors.primary} />
      ) : null}
      <Polyline coordinates={routePoints} strokeColor={theme.colors.primary} strokeWidth={4} />
    </MapView>
  );
}

export function RideTrackingScreen({ route }: Props) {
  const [driverPoint, setDriverPoint] = useState<Coordinate | null>(null);
  const [liveStatus, setLiveStatus] = useState('REQUESTED');
  const [assignedDriver, setAssignedDriver] = useState<DriverInfo | null>(null);

  const { data: ride, refetch } = useQuery({
    queryKey: ['ride', route.params.tripId],
    queryFn: () => apiRequest<RideDetail>(`/rides/${route.params.tripId}`),
  });

  useEffect(() => {
    if (ride?.status) setLiveStatus(ride.status);
    const accepted =
      ride?.assignments?.find((assignment) => assignment.status === 'ACCEPTED') ??
      ride?.assignments?.[0];
    if (accepted?.driverProfile) setAssignedDriver(accepted.driverProfile);
  }, [ride]);

  useEffect(() => {
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.emit('ride:join', route.params.tripId);
      socket.on(realtimeEvents.rideUpdated, (trip) => {
        if (trip.id !== route.params.tripId) return;
        setLiveStatus(trip.dispatchStatus ?? trip.status ?? 'REQUESTED');
        refetch();
      });
      socket.on(realtimeEvents.rideAssigned, (assignment: RideAssignmentEvent) => {
        if (assignment.tripId !== route.params.tripId) return;
        setLiveStatus(assignment.status === 'ACCEPTED' ? 'ASSIGNED' : 'ASSIGNING');
        if (assignment.driverProfile) {
          setAssignedDriver(assignment.driverProfile);
          if (
            assignment.driverProfile.currentLatitude &&
            assignment.driverProfile.currentLongitude
          ) {
            setDriverPoint({
              latitude: Number(assignment.driverProfile.currentLatitude),
              longitude: Number(assignment.driverProfile.currentLongitude),
            });
          }
        }
        Alert.alert(
          assignment.status === 'ACCEPTED' ? 'Driver assigned' : 'Driver found',
          assignment.status === 'ACCEPTED'
            ? 'Your driver accepted the trip and is on the way.'
            : 'A nearby driver has received your request.'
        );
        refetch();
      });
      socket.on(realtimeEvents.rideTrackingPoint, (point) => {
        setDriverPoint({ latitude: Number(point.latitude), longitude: Number(point.longitude) });
      });
      cleanup = () => {
        socket.emit('ride:leave', route.params.tripId);
        socket.disconnect();
      };
    });

    return () => cleanup();
  }, [refetch, route.params.tripId]);

  const pickup = useMemo(
    () => ({
      latitude: Number(ride?.pickupLatitude ?? 5.6508),
      longitude: Number(ride?.pickupLongitude ?? -0.1668),
    }),
    [ride?.pickupLatitude, ride?.pickupLongitude]
  );
  const dropoff = useMemo(
    () => ({
      latitude: Number(ride?.dropoffLatitude ?? 5.556),
      longitude: Number(ride?.dropoffLongitude ?? -0.1824),
    }),
    [ride?.dropoffLatitude, ride?.dropoffLongitude]
  );
  const latestPoint =
    (driverPoint ?? ride?.trackingPoints?.[0])
      ? {
          latitude: Number((driverPoint ?? ride?.trackingPoints?.[0])?.latitude),
          longitude: Number((driverPoint ?? ride?.trackingPoints?.[0])?.longitude),
        }
      : assignedDriver?.currentLatitude && assignedDriver?.currentLongitude
        ? {
            latitude: Number(assignedDriver.currentLatitude),
            longitude: Number(assignedDriver.currentLongitude),
          }
        : null;
  const routePoints = ride?.metadata?.expectedRoute?.polyline?.length
    ? ride.metadata.expectedRoute.polyline
    : latestPoint
      ? [pickup, latestPoint, dropoff]
      : [pickup, dropoff];
  const driverName = assignedDriver?.user?.name ?? assignedDriver?.user?.fullName ?? 'Driver';
  const vehicle = assignedDriver?.vehicle;
  const vehicleLabel = [vehicle?.color, vehicle?.make, vehicle?.model, vehicle?.plateNumber]
    .filter(Boolean)
    .join(' ');
  const isScheduledFuture = ride?.scheduledFor
    ? new Date(ride.scheduledFor).getTime() > Date.now()
    : false;
  const statusLabel =
    isScheduledFuture && !assignedDriver
      ? 'Scheduled'
      : liveStatus === 'NO_AVAILABLE_DRIVERS'
        ? 'No drivers online'
        : liveStatus === 'REQUESTED'
          ? 'Matching driver'
          : liveStatus === 'ASSIGNING'
            ? 'Driver found'
            : liveStatus.replaceAll('_', ' ').toLowerCase();

  function openDriverMap() {
    if (!latestPoint) {
      Alert.alert(
        'Driver location unavailable',
        'The driver location will appear when the driver shares GPS.'
      );
      return;
    }
    const query = `${latestPoint.latitude},${latestPoint.longitude}`;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    ).catch(() => {
      Alert.alert('Map unavailable', 'Could not open Google Maps on this device.');
    });
  }

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ gap: 8 }}>
          <StatusPill
            label={statusLabel}
            tone={liveStatus === 'NO_AVAILABLE_DRIVERS' ? 'warning' : 'success'}
          />
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.colors.ink }}>
            Live ride tracking
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            {ride?.tripCode ?? 'Trip'} from {ride?.pickupLabel ?? 'pickup'} to{' '}
            {ride?.dropoffLabel ?? 'destination'}.
          </Text>
        </View>

        <LazyRideMap
          pickup={pickup}
          dropoff={dropoff}
          latestPoint={latestPoint}
          routePoints={routePoints}
        />

        <View
          style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Car size={18} color={theme.colors.primary} />
            <Text style={{ fontWeight: '900', color: theme.colors.ink }}>
              {assignedDriver
                ? `${driverName} ${liveStatus === 'ASSIGNING' ? 'is reviewing your request' : 'is on the way'}`
                : isScheduledFuture
                  ? 'Driver matching starts near pickup time'
                  : 'Waiting for driver acceptance'}
            </Text>
          </View>
          <Text style={{ color: theme.colors.muted }}>
            {assignedDriver
              ? vehicleLabel || 'Vehicle details pending'
              : isScheduledFuture
                ? `Scheduled for ${new Date(ride?.scheduledFor ?? Date.now()).toLocaleString()}.`
                : 'Keep this screen open to receive the assignment in real time.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Call"
                icon={<Phone size={18} color="#fff" />}
                onPress={() => callPhone(assignedDriver?.user?.phone ?? BENBAX_PHONE)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="WhatsApp"
                icon={<MessageSquareText size={18} color={theme.colors.ink} />}
                onPress={() => openWhatsApp(assignedDriver?.user?.phone ?? BENBAX_PHONE)}
                variant="secondary"
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Open map"
                icon={<MapPinned size={18} color={theme.colors.ink} />}
                onPress={openDriverMap}
                variant="secondary"
              />
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}
