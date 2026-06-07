import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ApiResponseError, getApiBaseUrl, isApiConnectionError } from '../services/api';
import { theme } from '../theme/tokens';

export function ResetPasswordScreen({ navigation, route }: any) {
  const { phone, resetToken: initialToken } = route.params;
  const [token, setToken] = useState(initialToken || '');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  async function handleSubmit() {
    if (token.length !== 6) {
      setError('Enter the full 6-digit reset code.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, token, newPassword }),
      });

      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new ApiResponseError(
          body.error?.message || 'Reset failed',
          response.status,
          body.error?.code
        );
      }

      Alert.alert('Password updated', 'You can now sign in with your new password.', [
        { text: 'OK', onPress: () => navigation.navigate('SignIn') },
      ]);
    } catch (err) {
      if (isApiConnectionError(err)) {
        setError(`Cannot reach the API at ${getApiBaseUrl()}.`);
      } else if (err instanceof ApiResponseError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{
        flex: 1,
        backgroundColor: theme.colors.canvas,
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 20 + insets.bottom,
      }}
    >
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>
            Reset password
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: 16 }}>
            Enter the 6-digit code sent to {phone} and your new password.
          </Text>
        </View>

        <TextInput
          value={token}
          onChangeText={setToken}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          style={{ backgroundColor: '#fff', borderRadius: 8, padding: 14, fontSize: 16 }}
        />

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showPassword}
            placeholder="New password"
            autoComplete="new-password"
            style={{ flex: 1, padding: 14, fontSize: 16 }}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((s) => !s)}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff size={20} color={theme.colors.muted} />
            ) : (
              <Eye size={20} color={theme.colors.muted} />
            )}
          </TouchableOpacity>
        </View>

        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

        <Button label="Reset password" onPress={handleSubmit} loading={loading} />
        <Text style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 13 }}>or</Text>
        <Button
          label="Back to sign in"
          onPress={() => navigation.navigate('SignIn')}
          variant="quiet"
        />
      </View>
    </KeyboardAvoidingView>
  );
}
