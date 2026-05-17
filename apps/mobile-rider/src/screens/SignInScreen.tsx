import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { Button } from '../components/Button';
import { ApiResponseError, getApiBaseUrl, isApiConnectionError } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

export function SignInScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+233');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, register } = useAuthStore();

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') await login(phone, password);
      else await register({ name, phone, password });
    } catch (err) {
      if (isApiConnectionError(err)) {
        setError(`Cannot reach the API at ${getApiBaseUrl()}. Start the backend and make sure this phone is on the same network.`);
      } else if (err instanceof ApiResponseError && err.status === 401) {
        setError('Invalid phone or password.');
      } else if (err instanceof ApiResponseError && (err.status === 503 || err.code === 'DATABASE_UNAVAILABLE')) {
        setError('The backend database is offline. Start Postgres, then retry sign in.');
      } else {
        setError(err instanceof Error ? err.message : 'Authentication failed');
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
          <Text style={{ fontSize: 32, fontWeight: '900', color: theme.colors.ink }}>Benbax Rider</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 16 }}>Earn with verified dispatch, clear routes, and safer deliveries.</Text>
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
        <View style={{ backgroundColor: '#fff', borderRadius: 8, paddingRight: 10, flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="Password"
            style={{ flex: 1, padding: 14, fontSize: 16 }}
          />
          <Pressable
            onPress={() => setShowPassword((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            hitSlop={12}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            {showPassword ? <EyeOff size={22} color={theme.colors.muted} /> : <Eye size={22} color={theme.colors.muted} />}
          </Pressable>
        </View>
        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
        <Button label={mode === 'login' ? 'Sign in' : 'Create rider account'} onPress={submit} loading={loading} />
        <Button
          label={mode === 'login' ? 'New rider onboarding' : 'I already ride with Benbax'}
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          variant="secondary"
        />
      </View>
    </KeyboardAvoidingView>
  );
}
