import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ApiResponseError, getApiBaseUrl, isApiConnectionError } from '../services/api';
import { theme } from '../theme/tokens';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  async function handleSubmit() {
    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError('Enter the email address on your account.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: trimmedEmail }),
      });

      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new ApiResponseError(
          body.error?.message || 'Request failed',
          response.status,
          body.error?.code
        );
      }

      navigation.navigate('ResetPassword', { email: trimmedEmail });
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
            Forgot password
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: 16 }}>
            Enter your email to receive a 6-digit reset code.
          </Text>
        </View>

        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="Email address"
          placeholderTextColor={theme.colors.muted}
          style={{
            backgroundColor: '#fff',
            borderRadius: 8,
            padding: 14,
            fontSize: 16,
            color: theme.colors.ink,
          }}
        />

        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

        <Button label="Send reset code" onPress={handleSubmit} loading={loading} />
        <Text style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 13 }}>or</Text>
        <Button label="Back to sign in" onPress={() => navigation.goBack()} variant="quiet" />
      </View>
    </KeyboardAvoidingView>
  );
}
