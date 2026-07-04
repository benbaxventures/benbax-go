import { useNavigation } from '@react-navigation/native';
import { type NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import type { RootStackParamList } from '../navigation/types';
import { ApiResponseError, getApiBaseUrl, isApiConnectionError } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import * as GoogleSignIn from '@react-native-google-signin/google-signin';

const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={{ color: theme.colors.ink, fontSize: 14, fontWeight: '800' }}>{children}</Text>
  );
}

const inputStyle = {
  backgroundColor: '#fff',
  borderRadius: 8,
  borderColor: theme.colors.border,
  borderWidth: 1,
  color: theme.colors.ink,
  fontSize: 16,
  minHeight: 58,
  paddingHorizontal: 14,
};

export function SignInScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [partnerRole, setPartnerRole] = useState<'DRIVER' | 'RIDER'>('DRIVER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+233');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, register } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const googleSignInUnavailableReason = getGoogleSignInUnavailableReason();

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'login') await login(phone, password, rememberMe);
      else await register({ name, phone, password, role: partnerRole });
    } catch (err) {
      if (isApiConnectionError(err)) {
        setError(
          `Cannot reach the API at ${getApiBaseUrl()}. Start the backend and make sure this phone is on the same network.`
        );
      } else if (err instanceof ApiResponseError && err.status === 401) {
        setError('Invalid phone or password.');
      } else if (
        err instanceof ApiResponseError &&
        (err.status === 503 || err.code === 'DATABASE_UNAVAILABLE')
      ) {
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
      style={{
        flex: 1,
        backgroundColor: theme.colors.canvas,
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 32, fontWeight: '900', color: theme.colors.ink }}>
            Benbax Partner
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: 16 }}>
            Earn with passenger trips, deliveries, clear routes, and safety-first dispatch.
          </Text>
        </View>

        {mode === 'register' ? (
          <>
            <View style={{ gap: 8 }}>
              <FieldLabel>Partner type</FieldLabel>
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: theme.colors.surface,
                  borderRadius: 8,
                  padding: 3,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                {[
                  { role: 'DRIVER' as const, label: 'Ride driver' },
                  { role: 'RIDER' as const, label: 'Delivery rider' },
                ].map((item) => {
                  const selected = partnerRole === item.role;
                  return (
                    <Pressable
                      key={item.role}
                      onPress={() => setPartnerRole(item.role)}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        borderRadius: 6,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? theme.colors.primary : 'transparent',
                      }}
                    >
                      <Text
                        style={{ color: selected ? '#fff' : theme.colors.ink, fontWeight: '800' }}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <FieldLabel>Full name</FieldLabel>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter your legal name"
                autoCapitalize="words"
                autoComplete="name"
                accessibilityLabel="Full name"
                style={inputStyle}
              />
            </View>
          </>
        ) : null}
        <View style={{ gap: 8 }}>
          <FieldLabel>Phone number</FieldLabel>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+233 phone number"
            autoComplete="tel"
            accessibilityLabel="Phone number"
            style={inputStyle}
          />
        </View>
        <View style={{ gap: 8 }}>
          <FieldLabel>Password</FieldLabel>
          <View
            style={{ ...inputStyle, paddingRight: 10, flexDirection: 'row', alignItems: 'center' }}
          >
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="Enter password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              accessibilityLabel="Password"
              style={{ flex: 1, color: theme.colors.ink, fontSize: 16, paddingVertical: 14 }}
            />
            <Pressable
              onPress={() => setShowPassword((visible) => !visible)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={12}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              {showPassword ? (
                <EyeOff size={22} color={theme.colors.muted} />
              ) : (
                <Eye size={22} color={theme.colors.muted} />
              )}
            </Pressable>
          </View>
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
          label={
            mode === 'login'
              ? 'Sign in'
              : partnerRole === 'DRIVER'
                ? 'Create ride driver account'
                : 'Create delivery rider account'
          }
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
            <GoogleSignInButton role={partnerRole} onError={setError} />
          )
        ) : null}
        <Button
          label={mode === 'login' ? 'New partner onboarding' : 'I already partner with Benbax'}
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          variant="secondary"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function getGoogleSignInUnavailableReason() {
  if (Constants.appOwnership === 'expo') {
    return 'Google sign-in needs a development build. Expo Go cannot run native Google Sign-In.';
  }

  if (Platform.OS === 'android' && !GOOGLE_WEB_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in apps/mobile-driver/.env';
  }

  if (Platform.OS === 'ios' && !GOOGLE_IOS_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in apps/mobile-driver/.env';
  }

  if (Platform.OS === 'web' && !GOOGLE_WEB_CLIENT_ID) {
    return 'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in apps/mobile-driver/.env';
  }

  return null;
}

function GoogleSignInButton({
  role,
  onError,
}: {
  role: 'RIDER' | 'DRIVER';
  onError: (message: string | null) => void;
}) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const { loginWithGoogle } = useAuthStore();

  async function signInWithGoogle() {
    setGoogleLoading(true);
    onError(null);
    let googleStatusCodes: typeof GoogleSignIn.statusCodes | null = null;
    try {
      const googleModule = await loadGoogleSignIn().catch(() => null);

      async function tryAuthSessionFallback() {
        const AuthSessionModule = await import('expo-auth-session').catch(() => null);
        const WebBrowserModule = await import('expo-web-browser').catch(() => null);
        if (!AuthSessionModule)
          throw new Error(
            'expo-auth-session is not available. Install it to enable Google sign-in in Expo.'
          );

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
          scheme: 'benbax-driver',
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

        await loginWithGoogle({ idToken, accessToken, role } as any);
      }

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
          await loginWithGoogle({ accessToken: tokens.accessToken, idToken: tokens.idToken, role });
        } catch (nativeErr: unknown) {
          const isDevError =
            (typeof nativeErr === 'object' &&
              nativeErr !== null &&
              'code' in (nativeErr as any) &&
              (nativeErr as any).code === 'DEVELOPER_ERROR') ||
            (nativeErr instanceof Error && /DEVELOPER_ERROR/i.test(nativeErr.message));

          if (isDevError) {
            try {
              await tryAuthSessionFallback();
              return;
            } catch (fallbackErr) {
              onError(
                fallbackErr instanceof Error
                  ? fallbackErr.message
                  : 'Google sign-in is misconfigured for this APK. Add the APK signing SHA-1/SHA-256 to the Android OAuth client for com.benbax.driver, update google-services.json, then rebuild the APK.'
              );
              return;
            }
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

async function loadGoogleSignIn(): Promise<typeof GoogleSignIn> {
  return GoogleSignIn;
}

function isGoogleSignInError(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
