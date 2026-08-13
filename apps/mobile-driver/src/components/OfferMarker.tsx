import { Bike, Car, Flag } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import type { OfferPoint } from '../store/driverStore';

type Props = {
  pickup: OfferPoint;
  dropoff?: OfferPoint | undefined;
  clientName?: string | undefined;
  offerType: 'ride' | 'delivery';
  /** react-native-maps Marker component, injected like HotZoneOverlay. */
  Marker: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onPress?: () => void;
};

/**
 * The incoming-request notification bubble on the dispatch map. A pulsing pin
 * sits on the pickup point with the client's name in a bubble above it, and a
 * destination flag marks the dropoff. Tapping either focuses the route.
 */
export function OfferMarker({ pickup, dropoff, clientName, offerType, Marker, onPress }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  const Icon = offerType === 'ride' ? Car : Bike;
  const label = clientName || (offerType === 'ride' ? 'Passenger' : 'Customer');

  return (
    <>
      <Marker
        coordinate={{ latitude: pickup.latitude, longitude: pickup.longitude }}
        anchor={{ x: 0.5, y: 1 }}
        tracksViewChanges
        onPress={onPress}
        zIndex={20}
      >
        <View style={{ alignItems: 'center' }}>
          {/* Client name bubble */}
          <View
            style={{
              backgroundColor: '#0E7C66',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 10,
              marginBottom: 6,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }} numberOfLines={1}>
              {label}
            </Text>
            <Text style={{ color: '#D7FFF5', fontWeight: '700', fontSize: 9 }}>
              NEW {offerType === 'ride' ? 'RIDE' : 'DELIVERY'} REQUEST
            </Text>
          </View>
          {/* Pulsing pickup pin */}
          <Animated.View
            style={{
              position: 'absolute',
              bottom: 4,
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: '#0E7C66',
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            }}
          />
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: '#0E7C66',
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
            <Icon size={17} color="#fff" fill="#fff" />
          </View>
        </View>
      </Marker>

      {dropoff ? (
        <Marker
          coordinate={{ latitude: dropoff.latitude, longitude: dropoff.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          onPress={onPress}
          zIndex={10}
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: '#EF4444',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: '#fff',
                shadowColor: '#000',
                shadowOpacity: 0.3,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              }}
            >
              <Flag size={13} color="#fff" fill="#fff" />
            </View>
          </View>
        </Marker>
      ) : null}
    </>
  );
}
