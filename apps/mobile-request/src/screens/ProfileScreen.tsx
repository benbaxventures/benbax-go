import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { DownloadCloud, LogOut, MapPinned, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user, logout } = useAuthStore();
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);

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
