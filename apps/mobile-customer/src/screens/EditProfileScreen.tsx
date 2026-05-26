import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { apiRequest } from '../services/api';
import { updateStoredUser } from '../services/authStorage';
import { useAuthStore } from '../store/authStore';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      const updated = await apiRequest('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: name || undefined, email: email || undefined })
      });

      await updateStoredUser(updated as any);
      useAuthStore.setState({ user: updated as any });
      Alert.alert('Profile updated', 'Your name and email have been updated.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not update profile', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Edit profile</Text>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: theme.colors.muted, marginBottom: 6 }}>Full name</Text>
        <TextInput value={name} onChangeText={setName} style={{ height: 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: theme.colors.surface }} />
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: theme.colors.muted, marginBottom: 6 }}>Email</Text>
        <TextInput value={email ?? ''} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={{ height: 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 12, backgroundColor: theme.colors.surface }} />
      </View>

      <View style={{ marginTop: 16 }}>
        <Button label="Save" onPress={handleSave} loading={isSaving} />
      </View>
    </Screen>
  );
}
