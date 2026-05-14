import { useState } from 'react';
import Constants from 'expo-constants';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

export function SignInScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+233');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuthStore();
  const googleSignInUnavailableReason = getGoogleSignInUnavailableReason();

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
        {mode === 'login' ? (
          googleSignInUnavailableReason ? (
            <Button
              label="Continue with Google"
              onPress={() => setError(googleSignInUnavailableReason)}
              variant="secondary"
            />
          ) : (
            <GoogleSignInButton onError={setError} />
          )
        ) : null}
        <Button
          label={mode === 'login' ? 'Create a Benbax account' : 'I already have an account'}
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          variant="quiet"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function getGoogleSignInUnavailableReason() {
  if (Constants.appOwnership === 'expo') {
    return 'Google sign-in needs a development build. Expo Go cannot run native Google Sign-In.';
  }

  if (Platform.OS === 'android' && !process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in apps/mobile-customer/.env';
  }

  if (Platform.OS === 'android' && !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in apps/mobile-customer/.env';
  }

  if (Platform.OS === 'ios' && !process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in apps/mobile-customer/.env';
  }

  if (Platform.OS === 'web' && !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in apps/mobile-customer/.env';
  }

  return null;
}

function GoogleSignInButton({ onError }: { onError: (message: string | null) => void }) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const { loginWithGoogle } = useAuthStore();

  async function signInWithGoogle() {
    setGoogleLoading(true);
    onError(null);
    let googleStatusCodes: GoogleSignInModule['statusCodes'] | null = null;
    try {
      const { GoogleSignin, statusCodes } = await loadGoogleSignIn();
      googleStatusCodes = statusCodes;
      GoogleSignin.configure({
        ...(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
          ? { webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID }
          : {}),
        scopes: ['openid', 'profile', 'email']
      });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();

      if (response.type === 'cancelled') return;

      const tokens = await GoogleSignin.getTokens();
      await loginWithGoogle({
        accessToken: tokens.accessToken,
        idToken: tokens.idToken
      });
    } catch (err) {
      if (googleStatusCodes && isGoogleSignInError(err, googleStatusCodes.SIGN_IN_CANCELLED)) return;
      if (googleStatusCodes && isGoogleSignInError(err, googleStatusCodes.PLAY_SERVICES_NOT_AVAILABLE)) {
        onError('Google Play Services is not available or needs to be updated.');
        return;
      }
      onError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <Button
      label="Continue with Google"
      onPress={signInWithGoogle}
      loading={googleLoading}
      variant="secondary"
    />
  );
}

async function loadGoogleSignIn(): Promise<GoogleSignInModule> {
  return import('@react-native-google-signin/google-signin');
}

function isGoogleSignInError(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
