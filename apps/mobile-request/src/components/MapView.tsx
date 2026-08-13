import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { theme } from '../theme/tokens';

type MapModules = {
  MapView: any;
  Marker: any;
  Polyline: any;
};

let cachedModules: MapModules | null = null;
let loadPromise: Promise<MapModules> | null = null;

async function loadMapModules(): Promise<MapModules> {
  if (cachedModules) return cachedModules;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const mod = await import('react-native-maps');
    const modules: MapModules = {
      MapView: mod.default,
      Marker: mod.Marker,
      Polyline: mod.Polyline,
    };
    cachedModules = modules;
    return modules;
  })();

  return loadPromise;
}

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Props = {
  children?: ReactNode;
  initialRegion: MapRegion;
  style?: any;
  onPress?: (lat: number, lng: number) => void;
  mapRef?: React.MutableRefObject<any>;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  rotateEnabled?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  padding?: { top: number; right: number; bottom: number; left: number };
};

export function MapView({
  children,
  initialRegion,
  style,
  onPress,
  mapRef: externalRef,
  showsUserLocation = false,
  showsMyLocationButton = false,
  rotateEnabled = true,
  scrollEnabled = true,
  zoomEnabled = true,
  padding,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const internalRef = useRef<any>(null);
  const modulesRef = useRef<MapModules | null>(null);

  useEffect(() => {
    let mounted = true;
    loadMapModules()
      .then((mods) => {
        if (!mounted) return;
        modulesRef.current = mods;
        setLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setError('Map view is not available on this device.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Expose the map ref externally
  useEffect(() => {
    if (externalRef && internalRef.current) {
      externalRef.current = internalRef.current;
    }
  }, [externalRef, loaded]);

  if (error) {
    return (
      <View
        style={[
          {
            flex: 1,
            backgroundColor: theme.colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
          },
          style,
        ]}
      >
        <Text style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 14 }}>
          {error}
        </Text>
      </View>
    );
  }

  if (!loaded || !modulesRef.current) {
    return (
      <View
        style={[
          {
            flex: 1,
            backgroundColor: theme.colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <ActivityIndicator color={theme.colors.primary} size="small" />
      </View>
    );
  }

  const { MapView: RNMapView } = modulesRef.current;

  return (
    <RNMapView
      ref={internalRef}
      style={style ?? { flex: 1 }}
      initialRegion={initialRegion}
      onPress={(e: any) => {
        const { latitude, longitude } = e.nativeEvent.coordinate;
        onPress?.(latitude, longitude);
      }}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={showsMyLocationButton}
      rotateEnabled={rotateEnabled}
      scrollEnabled={scrollEnabled}
      zoomEnabled={zoomEnabled}
      mapPadding={padding}
    >
      {children}
    </RNMapView>
  );
}

// Re-export Marker and Polyline for convenience
export function MapMarker({
  coordinate,
  title,
  description,
  pinColor,
  onPress,
  flat,
  anchor,
  zIndex,
  children,
}: {
  coordinate: { latitude: number; longitude: number };
  title?: string;
  description?: string;
  pinColor?: string;
  onPress?: () => void;
  flat?: boolean;
  anchor?: { x: number; y: number };
  zIndex?: number;
  children?: ReactNode;
}) {
  const [mods, setMods] = useState<MapModules | null>(null);

  useEffect(() => {
    loadMapModules()
      .then(setMods)
      .catch(() => {});
  }, []);

  if (!mods) return null;
  const { Marker } = mods;

  return (
    <Marker
      coordinate={coordinate}
      title={title}
      description={description}
      pinColor={pinColor}
      onPress={onPress}
      flat={flat}
      anchor={anchor}
      zIndex={zIndex}
    >
      {children}
    </Marker>
  );
}

export function MapPolyline({
  coordinates,
  strokeColor,
  strokeWidth,
  lineDashPattern,
}: {
  coordinates: Array<{ latitude: number; longitude: number }>;
  strokeColor: string;
  strokeWidth: number;
  lineDashPattern?: number[];
}) {
  const [mods, setMods] = useState<MapModules | null>(null);

  useEffect(() => {
    loadMapModules()
      .then(setMods)
      .catch(() => {});
  }, []);

  if (!mods) return null;
  const { Polyline } = mods;

  return (
    <Polyline
      coordinates={coordinates}
      strokeColor={strokeColor}
      strokeWidth={strokeWidth}
      lineDashPattern={lineDashPattern}
    />
  );
}
