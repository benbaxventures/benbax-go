import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Updates from 'expo-updates';
import {
  Bell,
  DownloadCloud,
  Fingerprint,
  LogOut,
  MapPinned,
  ShieldCheck,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/types';
import { apiRequest } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user, logout, biometricEnabled, setBiometricEnabled } = useAuthStore();

  // Poll the in-app notification feed so the badge count stays current.
  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ['notifications-unread'],
    queryFn: () => apiRequest('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const notificationsUnread = unread?.count ?? 0;
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);
  const [togglingBiometric, setTogglingBiometric] = useState(false);

  useEffect(() => {
    void (async () => {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setBiometricAvailable(hasHardware && isEnrolled);
    })();
  }, []);

  async function handleBiometricToggle(enabled: boolean) {
    if (enabled && biometricAvailable === false) {
      Alert.alert(
        'Biometrics unavailable',
        'This device does not support biometric authentication, or no fingerprints/face data are registered. Add biometrics in your device settings first.'
      );
      return;
    }

    setTogglingBiometric(true);
    try {
      if (enabled) {
        // Verify biometrics work before enabling
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Enable biometric authentication',
          fallbackLabel: 'Use passcode',
          disableDeviceFallback: false,
        });
        if (!result.success) {
          Alert.alert('Verification failed', 'Could not verify your identity. Please try again.');
          return;
        }
      }
      await setBiometricEnabled(enabled);
    } catch {
      Alert.alert('Error', 'Could not update biometric settings.');
    } finally {
      setTogglingBiometric(false);
    }
  }

  function getUpdateErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (/failed to check for update/i.test(message)) {
      return 'Could not reach the update server. Check your internet connection, then try again.';
    }
    if (/No compatible update|runtime/i.test(message)) {
      return 'No compatible update is published for this installed build yet.';
    }
    return message || 'Could not check for updates. Try again later.';
  }

  async function handleUpdatePress() {
    if (!Updates.isEnabled) {
      Alert.alert(
        'Updates unavailable',
        'Remote updates are only available in installed preview or production builds.'
      );
      return;
    }

    setIsCheckingForUpdate(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) {
        Alert.alert(
          'No update available',
          'You already have the latest available version for this build.'
        );
        return;
      }

      await Updates.fetchUpdateAsync();
      Alert.alert('Update ready', 'The latest update has downloaded. Benbax will restart now.', [
        {
          text: 'Restart',
          onPress: () => {
            Updates.reloadAsync().catch((error) => {
              Alert.alert(
                'Restart failed',
                error instanceof Error ? error.message : 'Restart the app to apply the update.'
              );
            });
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Update check failed', getUpdateErrorMessage(error));
    } finally {
      setIsCheckingForUpdate(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Profile</Text>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 6 }}>
        <Text style={{ color: theme.colors.ink, fontSize: 20, fontWeight: '900' }}>
          {user?.name}
        </Text>
        <Text style={{ color: theme.colors.muted }}>{user?.phone}</Text>
        <Text style={{ color: theme.colors.muted }}>{user?.email ?? 'No email'}</Text>
      </View>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 8,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Fingerprint size={20} color={theme.colors.primary} />
          <View>
            <Text style={{ color: theme.colors.ink, fontWeight: '700' }}>
              Fingerprint / Face ID
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              {biometricAvailable === null
                ? 'Checking...'
                : biometricAvailable
                  ? 'Use biometrics to unlock the app'
                  : 'Not available on this device'}
            </Text>
          </View>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={handleBiometricToggle}
          disabled={togglingBiometric || biometricAvailable === null}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          thumbColor="#fff"
        />
      </View>
      <Button
        label={notificationsUnread > 0 ? `Notifications (${notificationsUnread})` : 'Notifications'}
        icon={<Bell size={18} color={theme.colors.ink} />}
        onPress={() => navigation.navigate('Notifications')}
        variant="secondary"
      />
      <Button
        label="Edit profile"
        icon={<MapPinned size={18} color={theme.colors.ink} />}
        onPress={() => navigation.navigate('EditProfile')}
        variant="secondary"
      />
      <Button
        label="Saved locations"
        icon={<MapPinned size={18} color={theme.colors.ink} />}
        onPress={() => undefined}
        variant="secondary"
      />
      <Button
        label="Privacy protection"
        icon={<ShieldCheck size={18} color={theme.colors.ink} />}
        onPress={() => navigation.navigate('PrivacyProtection')}
        variant="secondary"
      />
      <Button
        label="Update app"
        icon={<DownloadCloud size={18} color={theme.colors.ink} />}
        onPress={handleUpdatePress}
        loading={isCheckingForUpdate}
        variant="secondary"
      />
      <Button label="Sign out" icon={<LogOut size={18} color="#fff" />} onPress={logout} />
    </Screen>
  );
}
