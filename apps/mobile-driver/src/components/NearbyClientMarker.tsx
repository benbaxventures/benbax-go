import { User } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import type { NearbyClient } from '../store/driverStore';

type Props = {
  client: NearbyClient;
  /** react-native-maps Marker component, injected like HotZoneOverlay. */
  Marker: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const SERVICE_COLORS: Record<NonNullable<NearbyClient['serviceClass']>, string> = {
  economy: '#22C55E',
  comfort: '#0EA5E9',
  premium: '#F59E0B',
};

const DEFAULT_COLOR = '#22C55E';

/**
 * A live "passenger is online" pin: a person marker sitting inside a softly
 * pulsing ring so drivers can spot fresh demand at a glance. The ring loops on
 * the JS-driven Animated API; `tracksViewChanges` stays on so the pulse renders
 * inside the native map layer.
 */
export function NearbyClientMarker({ client, Marker }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const color = client.serviceClass ? SERVICE_COLORS[client.serviceClass] : DEFAULT_COLOR;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <Marker
      coordinate={{ latitude: client.latitude, longitude: client.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges
    >
      <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
        {/* Pulsing demand ring */}
        <Animated.View
          style={{
            position: 'absolute',
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: color,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          }}
        />
        {/* Passenger pin */}
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2.5,
            borderColor: '#fff',
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          <User size={16} color="#fff" fill="#fff" />
        </View>
      </View>
    </Marker>
  );
}
