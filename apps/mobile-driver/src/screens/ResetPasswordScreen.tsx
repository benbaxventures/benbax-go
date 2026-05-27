import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View, Alert } from 'react-native';
import { Button } from '../components/Button';
import { Eye, EyeOff } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { ApiResponseError, getApiBaseUrl, isApiConnectionError } from '../services/api';
import { theme } from '../theme/tokens';

export function ResetPasswordScreen({ navigation, route }: any) {
  const { phone, resetToken: initialToken } = route.params;
  const [token, setToken] = useState(initialToken || '');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ phone, token, newPassword })
      });

      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new ApiResponseError(body.error?.message || 'Reset failed', response.status, body.error?.code);
      }

      Alert.alert('Password updated', 'You can now sign in with your new password.', [
        { text: 'OK', onPress: () => navigation.navigate('SignIn') }
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

  const inputStyle = {
    backgroundColor: '#fff', borderRadius: 8, borderColor: theme.colors.border,
    borderWidth: 1, color: theme.colors.ink, fontSize: 16, minHeight: 58, paddingHorizontal: 14
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.canvas, justifyContent: 'center', padding: 20 }}
    >
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Reset password</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 16 }}>Enter the 6-digit code sent to {phone} and your new password.</Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.ink, fontSize: 14, fontWeight: '800' }}>Reset code</Text>
          <TextInput
            value={token}
            onChangeText={setToken}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            style={inputStyle}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.ink, fontSize: 14, fontWeight: '800' }}>New password</Text>
          <View style={{ ...inputStyle, paddingRight: 10, flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPassword}
              placeholder="Enter new password"
              autoComplete="new-password"
              style={{ flex: 1, color: theme.colors.ink, fontSize: 16, paddingVertical: 14 }}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={12}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              {showPassword ? <EyeOff size={22} color={theme.colors.muted} /> : <Eye size={22} color={theme.colors.muted} />}
            </Pressable>
          </View>
        </View>

        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

        <Button label="Reset password" onPress={handleSubmit} loading={loading} />
        <Button label="Back to sign in" onPress={() => navigation.navigate('SignIn')} variant="quiet" />
      </View>
    </KeyboardAvoidingView>
  );
}
