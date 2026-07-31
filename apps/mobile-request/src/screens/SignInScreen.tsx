import { useNavigation } from '@react-navigation/native';
import { type NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { Eye, EyeOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import type { RootStackParamList } from '../navigation/types';
import {
  ApiResponseError,
  checkApiHealth,
  getApiBaseUrl,
  isApiConnectionError,
} from '../services/api';
import { getHasRegisteredBefore } from '../services/authStorage';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

type GoogleSignInModule = Awaited<ReturnType<typeof loadGoogleSignIn>>;

const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  '227842274371-n0cvmj1u88nrp82kbfhsoqaf3qmgsbv4.apps.googleusercontent.com';

const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '227842274371-rsobq5m6fghnaitbs2tl9ih3rgrnco5a.apps.googleusercontent.com';

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export function SignInScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+233');
  // Login accepts either a phone number or an email; register keeps a dedicated
  // +233 phone field, so the two flows track their inputs separately.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'online' | 'api_offline' | 'database_offline' | null>(
    null
  );
  const [checkingApi, setCheckingApi] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const googleSignInUnavailableReason = getGoogleSignInUnavailableReason();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void (async () => {
      const hasRegistered = await getHasRegisteredBefore();
      if (!hasRegistered) {
        setMode('register');
      }
    })();
    void refreshApiStatus();
  }, []);

  async function refreshApiStatus() {
    setCheckingApi(true);
    const status = await checkApiHealth();
    setApiStatus(status);
    setCheckingApi(false);
  }

  async function submit() {
    const validationError = validateCredentials({ mode, name, email, phone, identifier, password });
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') await login(identifier, password, rememberMe);
      else await register({ name, phone, email, password });
    } catch (err) {
      if (isApiConnectionError(err)) {
        setApiStatus('api_offline');
        setError(
          `Cannot reach the API. Start the backend and confirm your phone is on the same network. Current API: ${getApiBaseUrl()}`
        );
      } else {
        // Provide more helpful messages for common auth failures.
        if (err instanceof ApiResponseError) {
          if (err.status === 401) setError('Invalid phone/email or password.');
          else if (err.status === 400 && err.code === 'VALIDATION_ERROR')
            setError(String(err.details ?? err.message));
          else if (err.status === 503 || err.code === 'DATABASE_UNAVAILABLE') {
            setApiStatus('database_offline');
            setError('The backend database is offline. Start Postgres, then retry sign in.');
          } else setError(err.message || 'Authentication failed');
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
        paddingBottom: 20 + insets.bottom,
      }}
    >
      <View style={{ gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Image
            source={require('../../assets/benbax-logo.png') as number} // eslint-disable-line @typescript-eslint/no-require-imports
            style={{ width: 80, height: 80, borderRadius: 16 }}
            resizeMode="contain"
          />
          <View style={{ gap: 4, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 28,
                fontWeight: '900',
                color: theme.colors.ink,
                textAlign: 'center',
              }}
            >
              BENBAX COMPANY LTD
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 15, textAlign: 'center' }}>
              Fast delivery and logistics built for Ghana.
            </Text>
          </View>
        </View>

        {apiStatus === 'api_offline' || apiStatus === 'database_offline' ? (
          <View
            style={{
              backgroundColor: '#FFF7E6',
              borderColor: theme.colors.accent,
              borderWidth: 1,
              borderRadius: theme.radius.md,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
              {apiStatus === 'database_offline' ? 'Database is offline' : 'API is offline'}
            </Text>
            <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
              {apiStatus === 'database_offline'
                ? 'The backend is reachable, but Postgres is not responding. Start the database, then retry.'
                : `Start the backend and make sure this phone can reach ${getApiBaseUrl()}.`}
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
          <>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={theme.colors.muted}
              style={{
                backgroundColor: '#fff',
                borderRadius: 8,
                padding: 14,
                fontSize: 16,
                color: theme.colors.ink,
              }}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="Email (for password reset codes)"
              placeholderTextColor={theme.colors.muted}
              style={{
                backgroundColor: '#fff',
                borderRadius: 8,
                padding: 14,
                fontSize: 16,
                color: theme.colors.ink,
              }}
            />
          </>
        ) : null}

        {mode === 'register' ? (
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+233 phone number"
            placeholderTextColor={theme.colors.muted}
            style={{
              backgroundColor: '#fff',
              borderRadius: 8,
              padding: 14,
              fontSize: 16,
              color: theme.colors.ink,
            }}
          />
        ) : (
          <TextInput
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="Phone number or email"
            placeholderTextColor={theme.colors.muted}
            style={{
              backgroundColor: '#fff',
              borderRadius: 8,
              padding: 14,
              fontSize: 16,
              color: theme.colors.ink,
            }}
          />
        )}
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
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="Password"
            placeholderTextColor={theme.colors.muted}
            style={{ flex: 1, padding: 14, fontSize: 16, color: theme.colors.ink }}
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

        {mode === 'login' ? (
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Switch
                value={rememberMe}
                onValueChange={setRememberMe}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor="#fff"
              />
              <Text style={{ color: theme.colors.ink }}>Remember me</Text>
            </View>
            <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
                Forgot password?
              </Text>
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

        <Button
          label={mode === 'login' ? 'Sign in' : 'Create account'}
          onPress={submit}
          loading={loading}
        />
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
          label={mode === 'login' ? 'Create a Benbax Request account' : 'I already have an account'}
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

function validateCredentials(input: {
  mode: 'login' | 'register';
  name: string;
  email: string;
  phone: string;
  identifier: string;
  password: string;
}) {
  const password = input.password.trim();

  // Login accepts either a phone number or an email, so only require a
  // non-empty identifier and let the API resolve which one it is.
  if (input.mode === 'login') {
    if (input.identifier.trim().length === 0) {
      return 'Enter your phone number or email.';
    }

    if (password.length < 6) {
      return 'Password must be at least 6 characters.';
    }

    return null;
  }

  if (input.name.trim().length < 2) {
    return 'Enter your full name.';
  }

  // Email is required at signup: password reset codes are delivered by email
  // (SMS is disabled), so an account with no email can never be recovered.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    return 'Enter a valid email address to receive password reset codes.';
  }

  const phone = input.phone.trim();
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

  if (Platform.OS === 'android' && !GOOGLE_ANDROID_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in apps/mobile-request/.env';
  }

  if (Platform.OS === 'android' && !GOOGLE_WEB_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in apps/mobile-request/.env';
  }

  if (Platform.OS === 'ios' && !GOOGLE_IOS_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in apps/mobile-request/.env';
  }

  if (Platform.OS === 'web' && !GOOGLE_WEB_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in apps/mobile-request/.env';
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
      const googleModule = await loadGoogleSignIn().catch(() => null);

      async function tryAuthSessionFallback() {
        const AuthSessionModule = await import('expo-auth-session').catch(() => null);
        const WebBrowserModule = await import('expo-web-browser').catch(() => null);
        if (!AuthSessionModule)
          throw new Error(
            'expo-auth-session is not available. Install it to enable Google sign-in in Expo.'
          );

        // complete any pending browser sessions
        (
          WebBrowserModule?.maybeCompleteAuthSession ??
          WebBrowserModule?.default?.maybeCompleteAuthSession
        )?.();

        const clientId = GOOGLE_WEB_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_IOS_CLIENT_ID;
        if (!clientId)
          throw new Error('Missing Google client ID. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env');

        const { AuthRequest, Prompt, makeRedirectUri } = AuthSessionModule;
        if (typeof AuthRequest !== 'function' || typeof makeRedirectUri !== 'function') {
          throw new Error('expo-auth-session is missing required Google sign-in methods.');
        }

        const redirectUri = makeRedirectUri({
          scheme: 'benbax',
          path: 'oauthredirect',
        });
        const request = new AuthRequest({
          clientId,
          redirectUri,
          responseType: 'id_token token',
          scopes: ['openid', 'profile', 'email'],
          prompt: Prompt.SelectAccount,
          usePKCE: false,
          extraParams: {
            nonce: Math.random().toString(36).substring(2),
          },
        });
        const result = await request.promptAsync({
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        });
        (
          WebBrowserModule?.maybeCompleteAuthSession ??
          WebBrowserModule?.default?.maybeCompleteAuthSession
        )?.();
        if (result.type === 'error') {
          throw new Error(
            result.error?.message ||
              result.params?.error_description ||
              result.params?.error ||
              'Google sign-in failed'
          );
        }
        if (result.type !== 'success') throw new Error('Google sign-in cancelled');
        const idToken = result.params?.id_token ?? result.params?.idToken;
        const accessToken = result.params?.access_token ?? result.params?.accessToken;
        if (!idToken && !accessToken) throw new Error('No token returned from Google');

        await loginWithGoogle({ idToken, accessToken } as any);
      }

      // If native GoogleSignin module is available and appears functional, try native first
      if (
        googleModule &&
        googleModule.GoogleSignin &&
        typeof googleModule.GoogleSignin.hasPlayServices === 'function'
      ) {
        const { GoogleSignin, statusCodes } = googleModule;
        googleStatusCodes = statusCodes;
        GoogleSignin.configure({
          ...(GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : {}),
          scopes: ['openid', 'profile', 'email'],
        });

        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

        try {
          await GoogleSignin.signIn();
          const tokens = await GoogleSignin.getTokens();
          await loginWithGoogle({ accessToken: tokens.accessToken, idToken: tokens.idToken });
        } catch (nativeErr: unknown) {
          // Native DEVELOPER_ERROR means Google's Android OAuth client does not match
          // this APK's package name/signing certificate. A browser fallback cannot fix it.
          const isDevError =
            (typeof nativeErr === 'object' &&
              nativeErr !== null &&
              'code' in (nativeErr as any) &&
              (nativeErr as any).code === 'DEVELOPER_ERROR') ||
            (nativeErr instanceof Error && /DEVELOPER_ERROR/i.test(nativeErr.message));

          if (isDevError) {
            onError(
              'Google sign-in is misconfigured for this APK. Add the APK signing SHA-1/SHA-256 to the Android OAuth client for com.benbax.customer, update google-services.json, then rebuild the APK.'
            );
            return;
          }

          if (
            googleStatusCodes &&
            isGoogleSignInError(nativeErr, googleStatusCodes.SIGN_IN_CANCELLED)
          )
            return;
          if (
            googleStatusCodes &&
            isGoogleSignInError(nativeErr, googleStatusCodes.PLAY_SERVICES_NOT_AVAILABLE)
          ) {
            onError('Google Play Services is not available or needs to be updated.');
            return;
          }

          throw nativeErr;
        }
      } else {
        // No native module available — use AuthSession fallback
        await tryAuthSessionFallback();
      }
    } catch (err) {
      if (googleStatusCodes && isGoogleSignInError(err, googleStatusCodes.SIGN_IN_CANCELLED))
        return;
      if (
        googleStatusCodes &&
        isGoogleSignInError(err, googleStatusCodes.PLAY_SERVICES_NOT_AVAILABLE)
      ) {
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

async function loadGoogleSignIn() {
  return import('@react-native-google-signin/google-signin');
}

function isGoogleSignInError(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
