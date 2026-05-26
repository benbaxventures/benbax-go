import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { Bell, ChevronLeft, History, MapPin, PhoneOff, ShieldCheck } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { usePrivacySettings, type PrivacySettings } from '../hooks/usePrivacySettings';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacyProtection'>;

type PrivacyOption = {
  key: keyof PrivacySettings;
  title: string;
  description: string;
  icon: ReactNode;
};

const options: PrivacyOption[] = [
  {
    key: 'preciseLocation',
    title: 'Precise location',
    description: 'Use exact pickup and drop-off coordinates only while arranging or tracking a delivery.',
    icon: <MapPin size={20} color={theme.colors.primary} />
  },
  {
    key: 'maskedPhone',
    title: 'Masked rider calls',
    description: 'Keep your real phone number hidden during delivery calls whenever masking is available.',
    icon: <PhoneOff size={20} color={theme.colors.primary} />
  },
  {
    key: 'shareDeliveryHistory',
    title: 'Delivery history sharing',
    description: 'Allow support to view previous delivery context when resolving a new case.',
    icon: <History size={20} color={theme.colors.primary} />
  },
  {
    key: 'safetyAlerts',
    title: 'Safety alerts',
    description: 'Receive alerts about route changes, emergency events, and unusual delivery activity.',
    icon: <Bell size={20} color={theme.colors.primary} />
  }
];

export function PrivacyProtectionScreen({ navigation }: Props) {
  const { settings, isLoading, updateSetting } = usePrivacySettings();

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          style={{
            width: 42,
            height: 42,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border
          }}
        >
          <ChevronLeft size={22} color={theme.colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Privacy protection</Text>
      </View>

      <View style={{ backgroundColor: theme.colors.primary, borderRadius: 8, padding: 16, gap: 8 }}>
        <ShieldCheck size={24} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>Your delivery data stays limited</Text>
        <Text style={{ color: '#D7FFF5' }}>
          Control location precision, phone visibility, support context, and safety notifications from one place.
        </Text>
      </View>

      {isLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}

      <View style={{ gap: 10 }}>
        {options.map((option) => (
          <View
            key={option.key}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 14,
              gap: 10
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#E9FBF6'
                }}
              >
                {option.icon}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.ink, fontSize: 16, fontWeight: '900' }}>{option.title}</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 3 }}>{option.description}</Text>
              </View>
              <Switch
                value={settings[option.key]}
                onValueChange={(value) => void updateSetting(option.key, value)}
                trackColor={{ false: theme.colors.border, true: '#9BE5D4' }}
                thumbColor={settings[option.key] ? theme.colors.primary : '#fff'}
              />
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
