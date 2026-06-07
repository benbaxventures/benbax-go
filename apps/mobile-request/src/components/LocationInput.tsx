import { MapPin, Mic, Send } from 'lucide-react-native';
import { Text, TextInput, View } from 'react-native';
import { theme } from '../theme/tokens';

type Props = {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  landmark?: string;
  onChangeLandmark?: (value: string) => void;
};

export function LocationInput({
  label,
  value,
  placeholder,
  onChangeText,
  landmark,
  onChangeLandmark,
}: Props) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.ink, fontSize: 14, fontWeight: '700' }}>{label}</Text>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          padding: 12,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MapPin size={18} color={theme.colors.primary} />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.muted}
            style={{ flex: 1, color: theme.colors.ink, fontSize: 16 }}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Send size={16} color={theme.colors.muted} />
          <TextInput
            value={landmark}
            onChangeText={onChangeLandmark}
            placeholder="Nearest landmark or WhatsApp pin note"
            placeholderTextColor={theme.colors.muted}
            style={{ flex: 1, color: theme.colors.ink, fontSize: 14 }}
          />
          <Mic size={16} color={theme.colors.muted} />
        </View>
      </View>
    </View>
  );
}
