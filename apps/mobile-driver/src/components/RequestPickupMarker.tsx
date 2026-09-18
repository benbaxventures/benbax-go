import { Car } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { OpenRideRequest } from '../store/driverStore';

type Props = {
  request: OpenRideRequest;
  selected: boolean;
  /** react-native-maps Marker component, injected like HotZoneOverlay. */
  Marker: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onPress: (request: OpenRideRequest) => void;
};

/**
 * Pickup pin for a waiting ride request, labelled with the fare so drivers can
 * read demand straight off the map. The content is static, so view tracking
 * is switched off shortly after each change to keep the map smooth with many
 * requests (starting with it off renders blank pins on Android).
 */
export const RequestPickupMarker = memo(function RequestPickupMarker({
  request,
  selected,
  Marker,
  onPress,
}: Props) {
  const color = selected ? '#B45309' : '#F59E0B';
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 800);
    return () => clearTimeout(timer);
  }, [selected, request.fare]);

  return (
    <Marker
      coordinate={{ latitude: request.pickup.latitude, longitude: request.pickup.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      zIndex={selected ? 20 : 8}
      tracksViewChanges={tracking}
      onPress={() => onPress(request)}
    >
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: color,
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderWidth: 2,
            borderColor: '#fff',
            elevation: 4,
          }}
        >
          <Car size={12} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>
            GHS {Math.round(request.fare)}
          </Text>
        </View>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 6,
            borderRightWidth: 6,
            borderTopWidth: 7,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: color,
          }}
        />
      </View>
    </Marker>
  );
});
