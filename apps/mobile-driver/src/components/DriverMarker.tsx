import { Navigation2 } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { theme } from '../theme/tokens';

type AnimatedRegionInstance = {
  timing: (config: Record<string, unknown>) => { start: () => void };
};

type Props = {
  MarkerAnimated: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  AnimatedRegion: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  latitude: number;
  longitude: number;
  /** Degrees clockwise from north (device travel heading). */
  heading: number;
};

const ANIMATION_DURATION_MS = 1000;

/**
 * Yango-style driver puck: a heading-rotated arrow that smoothly glides between
 * GPS fixes instead of teleporting. Position is interpolated via AnimatedRegion;
 * rotation is applied natively through the marker's `rotation` prop.
 */
export function DriverMarker({
  MarkerAnimated,
  AnimatedRegion,
  latitude,
  longitude,
  heading,
}: Props) {
  const regionRef = useRef<AnimatedRegionInstance | null>(null);

  if (regionRef.current === null) {
    regionRef.current = new AnimatedRegion({
      latitude,
      longitude,
      latitudeDelta: 0,
      longitudeDelta: 0,
    });
  }

  useEffect(() => {
    if (!latitude && !longitude) return;
    const config = {
      latitude,
      longitude,
      duration: ANIMATION_DURATION_MS,
      // AnimatedRegion coordinate animation is not supported by the native driver
      useNativeDriver: false,
    };
    regionRef.current?.timing(config).start();
  }, [latitude, longitude]);

  return (
    <MarkerAnimated
      coordinate={regionRef.current}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={heading}
      tracksViewChanges={Platform.OS === 'ios'}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: '#fff',
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 5,
        }}
      >
        <Navigation2 size={20} color="#fff" fill="#fff" />
      </View>
    </MarkerAnimated>
  );
}
