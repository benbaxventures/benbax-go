import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await updateUser({ name, email });
      Alert.alert('Profile updated', 'Your profile details have been saved successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert(
        'Error updating profile',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>
          Edit profile
        </Text>
        <Text style={{ color: theme.colors.muted }}>Update your personal details below.</Text>
      </View>

      <View style={{ gap: 14, marginTop: 10 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '700' }}>Full name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            style={{
              height: 48,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 8,
              paddingHorizontal: 12,
              backgroundColor: theme.colors.surface,
              color: theme.colors.ink,
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '700' }}>Email address</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="Enter your email (e.g. driver@benbax.com)"
            style={{
              height: 48,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 8,
              paddingHorizontal: 12,
              backgroundColor: theme.colors.surface,
              color: theme.colors.ink,
            }}
          />
        </View>

        <View style={{ marginTop: 10, gap: 10 }}>
          <Button label="Save changes" onPress={handleSave} loading={loading} />
          <Button label="Cancel" onPress={() => navigation.goBack()} variant="secondary" />
        </View>
      </View>
    </Screen>
  );
}
