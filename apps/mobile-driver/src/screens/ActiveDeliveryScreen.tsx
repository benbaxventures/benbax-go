import { realtimeEvents } from '@benbax/shared';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  Package,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { OfflineBanner } from '../components/OfflineBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { useRiderLocation } from '../hooks/useRiderLocation';
import { useVoiceNavigation } from '../hooks/useVoiceNavigation';
import type { RootStackParamList } from '../navigation/types';
import { apiRequest } from '../services/api';
import { createRealtimeClient } from '../services/realtime';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveDelivery'>;

type Coordinate = {
  latitude: number;
  longitude: number;
};

type DeliveryDetail = {
  id: string;
  pickupLatitude: string;
  pickupLongitude: string;
  dropoffLatitude: string;
  dropoffLongitude: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  status: string;
  otpCode?: string;
  estimatedFare?: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
  customerName?: string;
  customerRating?: number;
  stops?: Array<{
    id: string;
    label: string;
    latitude: string;
    longitude: string;
    completed: boolean;
  }>;
  metadata?: {
    expectedRoute?: {
      polyline?: Coordinate[];
    };
  };
  trackingPoints?: Array<{
    latitude: string;
    longitude: string;
  }>;
};

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

export function ActiveDeliveryScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [mapsModule, setMapsModule] = useState<MapsModule | null>(null);
  const MapView = mapsModule?.default;
  const Marker = mapsModule?.Marker;
  const Polyline = mapsModule?.Polyline;
  const [riderPoint, setRiderPoint] = useState<Coordinate | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [proofUri, setProofUri] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const {
    steps,
    currentStep,
    currentStepIndex,
    isNavigating,
    voiceEnabled,
    startNavigation,
    stopNavigation,
    toggleVoice,
  } = useVoiceNavigation();

  useRiderLocation(route.params.deliveryId, true);

  const {
    data: delivery,
    isLoading: deliveryLoading,
    isError: deliveryError,
    error: deliveryErr,
    refetch: refetchDelivery,
  } = useQuery({
    queryKey: ['delivery', route.params.deliveryId],
    queryFn: () => apiRequest<DeliveryDetail>(`/deliveries/${route.params.deliveryId}`),
  });

  useEffect(() => {
    loadMaps().then(setMapsModule);
  }, []);

  useEffect(() => {
    let cleanup: () => void = () => undefined;

    createRealtimeClient().then((socket) => {
      socket.emit('delivery:join', route.params.deliveryId);
      socket.on(realtimeEvents.trackingPoint, (point) => {
        const pt = { latitude: Number(point.latitude), longitude: Number(point.longitude) };
        setRiderPoint(pt);
      });
      socket.on(realtimeEvents.riderWarning, (warning) => {
        Alert.alert('Safety warning', warning.message ?? 'Your delivery route needs attention.', [
          { text: 'OK' },
        ]);
      });
      cleanup = () => {
        socket.emit('delivery:leave', route.params.deliveryId);
        socket.disconnect();
      };
    });

    return () => cleanup();
  }, [route.params.deliveryId]);

  const handleNavigate = useCallback(async () => {
    if (!delivery) return;

    if (isNavigating) {
      stopNavigation();
      return;
    }

    const lat = delivery.dropoffLatitude;
    const lng = delivery.dropoffLongitude;

    await startNavigation(lat, lng);
  }, [delivery, isNavigating, startNavigation, stopNavigation]);

  const handleProof = useCallback(async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        const galleryResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
        });
        if (!galleryResult.canceled && galleryResult.assets?.[0]) {
          setProofUri(galleryResult.assets[0].uri);
        }
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        mediaTypes: ['images'],
      });

      if (!result.canceled && result.assets?.[0]) {
        setProofUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert(
        'Camera unavailable',
        'Could not open camera. You can complete the delivery without photo proof.'
      );
    }
  }, []);

  const handleComplete = useCallback(async () => {
    setActionLoading('complete');
    try {
      const otp = delivery?.otpCode;
      if (otp) {
        Alert.alert('OTP Required', `Ask the customer for the delivery OTP: ${otp}`);
        setActionLoading(null);
        return;
      }

      const body: Record<string, unknown> = {};
      if (proofUri) body.proofUri = proofUri;

      await apiRequest(`/deliveries/${route.params.deliveryId}/complete`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      Alert.alert('Delivery completed', 'The package has been delivered.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      queryClient.invalidateQueries({ queryKey: ['delivery', route.params.deliveryId] });
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        await logout();
        return;
      }
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not complete delivery.');
    } finally {
      setActionLoading(null);
    }
  }, [delivery, proofUri, navigation, queryClient, logout, route.params.deliveryId]);

  const pickup = useMemo(
    () => ({
      latitude: Number(delivery?.pickupLatitude ?? 5.6508),
      longitude: Number(delivery?.pickupLongitude ?? -0.1668),
    }),
    [delivery?.pickupLatitude, delivery?.pickupLongitude]
  );
  const dropoff = useMemo(
    () => ({
      latitude: Number(delivery?.dropoffLatitude ?? 5.556),
      longitude: Number(delivery?.dropoffLongitude ?? -0.1824),
    }),
    [delivery?.dropoffLatitude, delivery?.dropoffLongitude]
  );
  const latestPoint = useMemo(() => {
    const pt = riderPoint ?? delivery?.trackingPoints?.[0];
    return pt
      ? {
          latitude: Number(pt.latitude),
          longitude: Number(pt.longitude),
        }
      : null;
  }, [riderPoint, delivery?.trackingPoints]);

  const routePoints = useMemo(() => {
    if (delivery?.metadata?.expectedRoute?.polyline?.length) {
      return delivery.metadata.expectedRoute.polyline;
    }
    if (latestPoint) return [pickup, latestPoint, dropoff];
    return [pickup, dropoff];
  }, [delivery?.metadata?.expectedRoute?.polyline, pickup, dropoff, latestPoint]);

  const fare = delivery?.estimatedFare;
  const distance = delivery?.estimatedDistance;
  const duration = delivery?.estimatedDuration;

  const formatDuration = (mins?: number) => {
    if (!mins) return '--';
    if (mins < 60) return `${Math.round(mins)} min`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${h}h ${m}m`;
  };

  const formatDistance = (km?: number) => {
    if (!km) return '--';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  };

  // ---- Loading skeleton ----
  if (deliveryLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <OfflineBanner />
        <SkeletonBlock height={40} borderRadius={20} style={{ marginBottom: 8 }} />
        <SkeletonBlock height={300} borderRadius={10} style={{ marginBottom: 16 }} />
        <SkeletonBlock height={60} borderRadius={14} style={{ marginBottom: 12 }} />
        <SkeletonBlock height={16} borderRadius={4} style={{ marginBottom: 8 }} />
        <SkeletonBlock height={16} borderRadius={4} style={{ marginBottom: 24 }} />
        <SkeletonBlock height={52} borderRadius={8} style={{ marginBottom: 10 }} />
        <SkeletonBlock height={52} borderRadius={8} />
      </View>
    );
  }

  // ---- Error state ----
  if (deliveryError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <OfflineBanner />
        <ErrorState
          title="Could not load delivery"
          message={
            deliveryErr instanceof Error
              ? deliveryErr.message
              : 'Please check your connection and try again.'
          }
          onRetry={() => refetchDelivery()}
        />
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 16, alignItems: 'center' }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {/* Full-screen Map */}
      {MapView && Marker && Polyline ? (
        <MapView
          style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          initialCamera={{
            center: pickup,
            pitch: 45,
            heading: 0,
            zoom: 14,
            altitude: 1200,
          }}
          showsUserLocation
          showsMyLocationButton={false}
          showsBuildings
          rotateEnabled
          pitchEnabled
        >
          <Marker coordinate={pickup} title="Pickup" description={delivery?.pickupLabel}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: theme.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: '#fff',
              }}
            >
              <MapPin size={14} color="#fff" />
            </View>
          </Marker>
          <Marker coordinate={dropoff} title="Drop-off" description={delivery?.dropoffLabel}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: theme.colors.danger ?? '#E53E3E',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: '#fff',
              }}
            >
              <MapPin size={14} color="#fff" />
            </View>
          </Marker>
          {latestPoint ? (
            <Marker coordinate={latestPoint} title="You" anchor={{ x: 0.5, y: 0.5 }}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: theme.colors.primary,
                  borderWidth: 3,
                  borderColor: '#fff',
                }}
              />
            </Marker>
          ) : null}
          <Polyline coordinates={routePoints} strokeColor={theme.colors.primary} strokeWidth={4} />
        </MapView>
      ) : (
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Package size={48} color={theme.colors.muted} />
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 18 }}>
            Map unavailable
          </Text>
          <Text style={{ color: theme.colors.muted, textAlign: 'center', paddingHorizontal: 32 }}>
            Build a development or production APK to test map rendering.
          </Text>
        </View>
      )}

      {/* Top header overlay */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 18, color: theme.colors.ink }}>←</Text>
        </TouchableOpacity>
        <View
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderRadius: 20,
            paddingVertical: 8,
            paddingHorizontal: 14,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          <Text style={{ color: theme.colors.ink, fontWeight: '700', fontSize: 13 }}>
            {delivery?.pickupLabel ?? 'Pickup'} → {delivery?.dropoffLabel ?? 'Drop-off'}
          </Text>
        </View>
        {/* Voice toggle */}
        <TouchableOpacity
          onPress={toggleVoice}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          {voiceEnabled ? (
            <Volume2 size={18} color={theme.colors.primary} />
          ) : (
            <VolumeX size={18} color={theme.colors.muted} />
          )}
        </TouchableOpacity>
      </View>

      {/* Voice navigation banner */}
      {isNavigating && currentStep && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 60,
            left: 16,
            right: 16,
            backgroundColor: theme.colors.primary,
            borderRadius: 12,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Navigation size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>
              {currentStep.instruction}
            </Text>
            <Text style={{ color: '#D7FFF5', fontSize: 12 }}>{currentStep.distance}</Text>
          </View>
          <Text style={{ color: '#D7FFF5', fontSize: 11, fontWeight: '700' }}>
            {currentStepIndex + 1}/{steps.length}
          </Text>
        </View>
      )}

      {/* Bottom Sheet */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: -4 },
          elevation: 10,
          paddingBottom: insets.bottom + 8,
        }}
      >
        {/* Drag handle */}
        <View
          style={{
            alignSelf: 'center',
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.colors.border,
            marginTop: 10,
            marginBottom: 8,
          }}
        />

        {/* Fare card */}
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: theme.colors.primary,
            borderRadius: 14,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 2 }}>
            <Text style={{ color: '#D7FFF5', fontSize: 12, fontWeight: '700' }}>Delivery fare</Text>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>
              GHS {fare != null ? fare.toFixed(2) : '--'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Clock size={16} color="#D7FFF5" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                {formatDuration(duration)}
              </Text>
            </View>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <MapPin size={16} color="#D7FFF5" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                {formatDistance(distance)}
              </Text>
            </View>
          </View>
        </View>

        {/* Stops list */}
        {delivery?.stops && delivery.stops.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 10, gap: 6 }}>
            <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '700' }}>
              STOPS ({delivery.stops.filter((s) => !s.completed).length} remaining)
            </Text>
            {delivery.stops.map((stop, i) => (
              <View
                key={stop.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: stop.completed
                    ? theme.colors.primary + '10'
                    : theme.colors.canvas,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: stop.completed ? theme.colors.primary : theme.colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {stop.completed ? (
                    <CheckCircle2 size={14} color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{i + 1}</Text>
                  )}
                </View>
                <Text
                  style={{
                    flex: 1,
                    color: stop.completed ? theme.colors.muted : theme.colors.ink,
                    fontWeight: '700',
                    fontSize: 13,
                    textDecorationLine: stop.completed ? 'line-through' : 'none',
                  }}
                  numberOfLines={1}
                >
                  {stop.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Location details */}
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.accent,
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '600' }}>
                PICKUP
              </Text>
              <Text
                style={{ color: theme.colors.ink, fontWeight: '700', fontSize: 14 }}
                numberOfLines={1}
              >
                {delivery?.pickupLabel ?? 'Pickup location'}
              </Text>
            </View>
          </View>
          <View
            style={{
              marginLeft: 3,
              width: 2,
              height: 12,
              backgroundColor: theme.colors.border,
              alignSelf: 'flex-start',
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.danger ?? '#E53E3E',
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '600' }}>
                DROP-OFF
              </Text>
              <Text
                style={{ color: theme.colors.ink, fontWeight: '700', fontSize: 14 }}
                numberOfLines={1}
              >
                {delivery?.dropoffLabel ?? 'Drop-off location'}
              </Text>
            </View>
          </View>
        </View>

        {/* Customer info */}
        {delivery?.customerName ? (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: theme.colors.primary + '20',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>
                {delivery.customerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: theme.colors.ink, fontWeight: '600', fontSize: 13 }}>
              {delivery.customerName}
            </Text>
            {delivery.customerRating != null && (
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                ★ {delivery.customerRating.toFixed(1)}
              </Text>
            )}
          </View>
        ) : null}

        {/* OTP & Proof section */}
        {delivery?.otpCode || proofUri ? (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 10,
              padding: 10,
              backgroundColor: theme.colors.canvas,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {delivery?.otpCode ? (
              <Text style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 13 }}>
                OTP: {delivery.otpCode}
              </Text>
            ) : null}
            {proofUri ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={14} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '600' }}>
                  Proof captured
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Action buttons */}
        <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={isNavigating ? 'Stop nav' : 'Navigate'}
                icon={<Navigation size={18} color="#fff" />}
                onPress={handleNavigate}
                variant={isNavigating ? 'danger' : 'primary'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={proofUri ? 'Re-take proof' : 'Capture proof'}
                icon={<Camera size={18} color={theme.colors.ink} />}
                onPress={handleProof}
                variant="secondary"
              />
            </View>
          </View>
          <Button
            label="Complete delivery"
            icon={<CheckCircle2 size={18} color="#fff" />}
            onPress={handleComplete}
            loading={actionLoading === 'complete'}
          />
        </View>
      </View>
    </View>
  );
}
