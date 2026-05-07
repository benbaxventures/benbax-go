import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function SignInScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+233');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuthStore();

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') await login(phone, password);
      else await register({ name, phone, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
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
          <Text style={{ fontSize: 32, fontWeight: '900', color: theme.colors.ink }}>Benbax</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 16 }}>Fast delivery and logistics built for Ghana.</Text>
        </View>

        {mode === 'register' ? (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            style={{ backgroundColor: '#fff', borderRadius: 8, padding: 14, fontSize: 16 }}
          />
        ) : null}

        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+233 phone number"
          style={{ backgroundColor: '#fff', borderRadius: 8, padding: 14, fontSize: 16 }}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          style={{ backgroundColor: '#fff', borderRadius: 8, padding: 14, fontSize: 16 }}
        />

        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

        <Button label={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submit} loading={loading} />
        <Button
          label={mode === 'login' ? 'Create a Benbax account' : 'I already have an account'}
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          variant="quiet"
        />
      </View>
    </KeyboardAvoidingView>
  );
}
