import { UserPlus } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import type { NearbyClient } from '../store/driverStore';
import { theme } from '../theme/tokens';

type Props = {
  client: NearbyClient | null;
  topInset: number;
  /** Called when the toast finishes hiding (auto or on tap). */
  onHide: () => void;
  /** Optional tap handler, e.g. to recenter the map on the client. */
  onPress?: (client: NearbyClient) => void;
};

const VISIBLE_MS = 3200;

const SERVICE_LABELS: Record<NonNullable<NearbyClient['serviceClass']>, string> = {
  economy: 'Economy',
  comfort: 'Comfort',
  premium: 'Premium',
};

/**
 * Slides a compact banner down from the top when a passenger comes online near
 * the driver, then springs back up and auto-dismisses. Purely presentational —
 * the parent owns the `client` value and clears it via `onHide`.
 */
export function ClientOnlineToast({ client, topInset, onHide, onPress }: Props) {
  const translateY = useRef(new Animated.Value(-140)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!client) return;

    Animated.spring(translateY, {
      toValue: 0,
      stiffness: 300,
      damping: 30,
      mass: 1,
      useNativeDriver: true,
    }).start();

    hideTimer.current = setTimeout(dismiss, VISIBLE_MS);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [client]);

  function dismiss() {
    Animated.spring(translateY, {
      toValue: -140,
      stiffness: 300,
      damping: 30,
      mass: 1,
      useNativeDriver: true,
    }).start(() => onHide());
  }

  if (!client) return null;

  const detail =
    client.distanceKm != null
      ? `${client.distanceKm.toFixed(1)} km away`
      : client.serviceClass
        ? `${SERVICE_LABELS[client.serviceClass]} ride`
        : 'Tap to view on map';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: topInset + 60,
        left: 16,
        right: 16,
        transform: [{ translateY }],
      }}
    >
      <Pressable
        onPress={() => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          onPress?.(client);
          dismiss();
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: theme.colors.ink,
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 12,
          ...theme.shadow,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#22C55E',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <UserPlus size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>
            {client.name ? `${client.name} is online` : 'Passenger online nearby'}
          </Text>
          <Text style={{ color: '#D1D5DB', fontSize: 12 }}>{detail}</Text>
        </View>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#22C55E',
          }}
        />
      </Pressable>
    </Animated.View>
  );
}
