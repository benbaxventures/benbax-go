import { Text, View } from 'react-native';

type HotZone = {
  id: string;
  center: { latitude: number; longitude: number };
  radius: number;
  demandLevel: 'high' | 'medium' | 'low';
  label?: string;
};

type Props = {
  zones: HotZone[];
  MapView: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  Marker: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const DEMAND_COLORS = {
  high: '#8B5CF6',
  medium: '#A78BFA',
  low: '#C4B5FD',
};

const DEMAND_LABELS = {
  high: 'High demand',
  medium: 'Medium demand',
  low: 'Low demand',
};

export function HotZoneOverlay({ zones, Marker }: Props) {
  if (!zones.length) return null;

  return (
    <>
      {zones.map((zone) => (
        <View key={zone.id}>
          <Marker coordinate={zone.center} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View
              style={{
                width: zone.radius * 2,
                height: zone.radius * 2,
                borderRadius: zone.radius,
                backgroundColor: DEMAND_COLORS[zone.demandLevel] + '30',
                borderWidth: 2,
                borderColor: DEMAND_COLORS[zone.demandLevel] + '60',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  backgroundColor: DEMAND_COLORS[zone.demandLevel],
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                  {zone.label || DEMAND_LABELS[zone.demandLevel]}
                </Text>
              </View>
            </View>
          </Marker>
        </View>
      ))}
    </>
  );
}
