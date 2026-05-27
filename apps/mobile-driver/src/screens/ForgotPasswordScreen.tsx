import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { ApiResponseError, getApiBaseUrl, isApiConnectionError } from '../services/api';
import { theme } from '../theme/tokens';

export function ForgotPasswordScreen({ navigation }: any) {
  const [phone, setPhone] = useState('+233');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!phone.startsWith('+233') || phone.length < 12) {
      setError('Enter a valid Ghana phone number starting with +233.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });

      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new ApiResponseError(body.error?.message || 'Request failed', response.status, body.error?.code);
      }

      navigation.navigate('ResetPassword', { phone, resetToken: body.data.resetToken });
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
      style={{ flex: 1, backgroundColor: theme.colors.canvas, justifyContent: 'center', padding: 20 }}
    >
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Forgot password</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 16 }}>Enter your phone number to receive a 6-digit reset code.</Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.ink, fontSize: 14, fontWeight: '800' }}>Phone number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+233 phone number"
            autoComplete="tel"
            style={{
              backgroundColor: '#fff', borderRadius: 8, borderColor: theme.colors.border,
              borderWidth: 1, color: theme.colors.ink, fontSize: 16, minHeight: 58, paddingHorizontal: 14
            }}
          />
        </View>

        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

        <Button label="Send reset code" onPress={handleSubmit} loading={loading} />
        <Text style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 13 }}>or</Text>
        <Button label="Back to sign in" onPress={() => navigation.goBack()} variant="secondary" />
      </View>
    </KeyboardAvoidingView>
  );
}
