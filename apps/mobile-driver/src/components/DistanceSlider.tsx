import { Text, View } from 'react-native';
import { theme } from '../theme/tokens';

type Props = {
  value: number;
  onValueChange: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
};

export function DistanceSlider({
  value,
  onValueChange,
  minimumValue = 1,
  maximumValue = 25,
}: Props) {
  const percentage = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;

  const presetValues = [3, 5, 10, 15, 25];

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.muted, fontSize: 13 }}>Max pickup distance</Text>
        <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 16 }}>
          {value} km
        </Text>
      </View>

      {/* Slider track */}
      <View style={{ position: 'relative', height: 40, justifyContent: 'center' }}>
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.colors.border,
          }}
        >
          <View
            style={{
              width: `${percentage}%`,
              height: '100%',
              backgroundColor: theme.colors.primary,
              borderRadius: 3,
            }}
          />
        </View>

        {/* Thumb */}
        <View
          style={{
            position: 'absolute',
            left: `${percentage}%`,
            top: 10,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: theme.colors.primary,
            borderWidth: 3,
            borderColor: '#fff',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
            marginLeft: -12,
          }}
        />
      </View>

      {/* Preset buttons */}
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'space-between' }}>
        {presetValues.map((preset) => (
          <Text
            key={preset}
            onPress={() => onValueChange(preset)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 14,
              backgroundColor: value === preset ? theme.colors.primary : theme.colors.surface,
              color: value === preset ? '#fff' : theme.colors.muted,
              fontWeight: '700',
              fontSize: 12,
              overflow: 'hidden',
            }}
          >
            {preset} km
          </Text>
        ))}
      </View>
    </View>
  );
}
