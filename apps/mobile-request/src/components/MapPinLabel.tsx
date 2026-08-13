import { Text, View } from 'react-native';

/**
 * A small badge + dot rendered as a marker's children so every map pin carries
 * a readable label ("Pickup", "Dropoff", "Current location", "Driver") instead
 * of relying on the default callout.
 */
export function MapPinLabel({
  color,
  title,
  subtitle,
}: {
  color: string;
  title: string;
  subtitle?: string | null | undefined;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 8,
          borderWidth: 1,
          borderColor: color,
          paddingHorizontal: 8,
          paddingVertical: 3,
          marginBottom: 3,
          maxWidth: 170,
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 3,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color, fontSize: 11, fontWeight: '800', textAlign: 'center' }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: '#374151', fontSize: 9, textAlign: 'center', maxWidth: 160 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: '#fff',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      />
    </View>
  );
}
