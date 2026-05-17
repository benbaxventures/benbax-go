import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { KeyboardAvoidingView, Platform, Text, TextInput, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff } from 'lucide-react-native';
import { Button } from '../components/Button';
import { checkApiHealth, getApiBaseUrl, isApiConnectionError, ApiResponseError } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

export function SignInScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+233');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [checkingApi, setCheckingApi] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuthStore();
  const googleSignInUnavailableReason = getGoogleSignInUnavailableReason();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void refreshApiStatus();
  }, []);

  async function refreshApiStatus() {
    setCheckingApi(true);
    const isOnline = await checkApiHealth();
    setApiOnline(isOnline);
    setCheckingApi(false);
  }

  async function submit() {
    const validationError = validateCredentials({ mode, name, phone, password });
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') await login(phone, password);
      else await register({ name, phone, password });
    } catch (err) {
      if (isApiConnectionError(err)) {
        setApiOnline(false);
        setError(`Cannot reach the API. Start the backend and confirm your phone is on the same network. Current API: ${getApiBaseUrl()}`);
      } else {
        // Provide more helpful messages for common auth failures.
        if (err instanceof ApiResponseError) {
          if (err.status === 401) setError('Invalid phone or password.');
          else if (err.status === 400 && err.code === 'VALIDATION_ERROR') setError(String(err.details ?? err.message));
          else if (err.status === 503 || err.code === 'DATABASE_UNAVAILABLE') {
            setApiOnline(false);
            setError('The backend database is offline. Start Postgres, then retry sign in.');
          }
          else setError(err.message || 'Authentication failed');
        } else {
          setError(err instanceof Error ? err.message : 'Authentication failed');
        }
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
        paddingBottom: 20 + insets.bottom
      }}
    >
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 32, fontWeight: '900', color: theme.colors.ink }}>Benbax</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 16 }}>Fast delivery and logistics built for Ghana.</Text>
        </View>

        {apiOnline === false ? (
          <View
            style={{
              backgroundColor: '#FFF7E6',
              borderColor: theme.colors.accent,
              borderWidth: 1,
              borderRadius: theme.radius.md,
              padding: 12,
              gap: 8
            }}
          >
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>API is offline</Text>
            <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
              Start the backend and make sure this phone can reach {getApiBaseUrl()}.
            </Text>
            <Button
              label={checkingApi ? 'Checking API' : 'Retry API check'}
              onPress={refreshApiStatus}
              loading={checkingApi}
              variant="secondary"
            />
          </View>
        ) : null}

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
        <View style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="Password"
            style={{ flex: 1, padding: 14, fontSize: 16 }}
          />
          <TouchableOpacity onPress={() => setShowPassword((s) => !s)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? <EyeOff size={20} color={theme.colors.muted} /> : <Eye size={20} color={theme.colors.muted} />}
          </TouchableOpacity>
        </View>

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
          onPress={() => {
            setError(null);
            setMode(mode === 'login' ? 'register' : 'login');
          }}
          variant="quiet"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function validateCredentials(input: { mode: 'login' | 'register'; name: string; phone: string; password: string }) {
  const phone = input.phone.trim();
  const password = input.password.trim();

  if (input.mode === 'register' && input.name.trim().length < 2) {
    return 'Enter your full name.';
  }

  if (!phone.startsWith('+233') || phone.length < 12) {
    return 'Enter a valid Ghana phone number starting with +233.';
  }

  if (password.length < 6) {
    return 'Password must be at least 6 characters.';
  }

  return null;
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
