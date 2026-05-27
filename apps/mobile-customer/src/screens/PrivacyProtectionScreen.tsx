import type { ReactNode } from 'react';
import { Alert, ActivityIndicator, Linking, Pressable, Switch, Text, View } from 'react-native';
import { Bell, ChevronLeft, Download, Fingerprint, History, MapPin, PhoneOff, ShieldCheck, Trash2 } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { usePrivacySettings, type PrivacySettings } from '../hooks/usePrivacySettings';
import { deleteAccount, exportMyData } from '../services/privacy';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../theme/tokens';
import { useState } from 'react';

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
  },
  {
    key: 'biometricLock',
    title: 'Biometric lock',
    description: 'Require Face ID or fingerprint to open the app.',
    icon: <Fingerprint size={20} color={theme.colors.primary} />
  }
];

export function PrivacyProtectionScreen({ navigation }: Props) {
  const { settings, isLoading, updateSetting } = usePrivacySettings();
  const logout = useAuthStore((state) => state.logout);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const data = await exportMyData();
      Alert.alert('Data exported', `Your data has been retrieved (${Object.keys(data).length} sections). Check your profile for details.`);
    } catch {
      Alert.alert('Export failed', 'Could not export your data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account, personal data, and all associated records. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete my account', style: 'destructive', onPress: handleDelete }
      ]
    );
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteAccount();
      await logout();
    } catch {
      Alert.alert('Deletion failed', 'Could not delete your account. Please contact support.');
      setIsDeleting(false);
    }
  }

  async function handleBiometricToggle(value: boolean) {
    if (!value) {
      await updateSetting('biometricLock', false);
      return;
    }

    try {
      const LocalAuthentication = await import('expo-local-authentication');
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert(
          'Biometric not set up',
          'Please enrol Face ID or fingerprint in your device settings first.',
          [{ text: 'OK', style: 'default' }]
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable biometric lock',
        fallbackLabel: 'Use passcode'
      });

      if (result.success) {
        await updateSetting('biometricLock', true);
      }
    } catch {
      Alert.alert('Not available', 'Biometric authentication is not supported on this device.');
    }
  }

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
                onValueChange={option.key === 'biometricLock' ? handleBiometricToggle : (value) => void updateSetting(option.key, value)}
                trackColor={{ false: theme.colors.border, true: '#9BE5D4' }}
                thumbColor={settings[option.key] ? theme.colors.primary : '#fff'}
              />
            </View>
          </View>
        ))}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 16, gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          disabled={isExporting}
          onPress={handleExport}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 14,
            borderRadius: 8,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: isExporting ? 0.6 : 1
          }}
        >
          <Download size={20} color={theme.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.ink, fontSize: 16, fontWeight: '900' }}>Export my data</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 3 }}>Download a copy of your personal data</Text>
          </View>
          {isExporting ? <ActivityIndicator color={theme.colors.primary} /> : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL('https://benbax.com/privacy')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 14,
            borderRadius: 8,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border
          }}
        >
          <ShieldCheck size={20} color={theme.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.ink, fontSize: 16, fontWeight: '900' }}>Privacy policy</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 3 }}>How we handle your data</Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={isDeleting}
          onPress={confirmDelete}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 14,
            borderRadius: 8,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: '#FCA5A5',
            opacity: isDeleting ? 0.6 : 1
          }}
        >
          <Trash2 size={20} color="#EF4444" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '900' }}>
              {isDeleting ? 'Deleting...' : 'Delete my account'}
            </Text>
            <Text style={{ color: theme.colors.muted, marginTop: 3 }}>Permanently remove your account and data</Text>
          </View>
          {isDeleting ? <ActivityIndicator color="#EF4444" /> : null}
        </Pressable>
      </View>
    </Screen>
  );
}
