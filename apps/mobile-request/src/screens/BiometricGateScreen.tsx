import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint, LogOut, RefreshCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

type GateState =
  | { status: 'checking' }
  | { status: 'unavailable'; reason: string }
  | { status: 'ready' }
  | { status: 'prompting' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export function BiometricGateScreen({ onSuccess }: { onSuccess: () => void }) {
  const [gate, setGate] = useState<GateState>({ status: 'checking' });
  const { user, setBiometricEnabled, logout } = useAuthStore();
  const insets = useSafeAreaInsets();

  const promptBiometric = async () => {
    setGate({ status: 'prompting' });
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your identity to unlock Benbax',
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setGate({ status: 'success' });
        onSuccess();
      } else {
        // User cancelled or failed
        const message =
          result.error === 'user_cancel'
            ? 'Biometric verification was cancelled.'
            : 'Biometric verification failed. Please try again or use your password.';
        setGate({ status: 'error', message });
      }
    } catch (err) {
      setGate({
        status: 'error',
        message: err instanceof Error ? err.message : 'Biometric verification failed.',
      });
    }
  };

  const checkBiometrics = async () => {
    setGate({ status: 'checking' });
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);

      if (!hasHardware) {
        setGate({
          status: 'unavailable',
          reason: 'This device does not support fingerprint or face ID.',
        });
        return;
      }

      if (!isEnrolled) {
        setGate({
          status: 'unavailable',
          reason:
            'No fingerprints or face data are registered on this device. Add biometrics in your device settings, then try again.',
        });
        return;
      }

      setGate({ status: 'ready' });
      await promptBiometric();
    } catch (err) {
      setGate({
        status: 'unavailable',
        reason: err instanceof Error ? err.message : 'Could not check biometric availability.',
      });
    }
  };

  useEffect(() => {
    void checkBiometrics();
  }, []);

  async function handleUsePassword() {
    await logout();
  }

  async function handleDisableBiometrics() {
    await setBiometricEnabled(false);
    onSuccess();
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.canvas,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingTop: insets.top + 40,
        paddingBottom: Math.max(insets.bottom, 24),
      }}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
        {/* App branding */}
        <Image
          source={require('../../assets/logo.png') as number} // eslint-disable-line @typescript-eslint/no-require-imports
          style={{ width: 100, height: 100, borderRadius: 20 }}
          resizeMode="contain"
        />

        {gate.status === 'checking' || gate.status === 'prompting' ? (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '900',
                color: theme.colors.ink,
                textAlign: 'center',
              }}
            >
              {gate.status === 'checking' ? 'Checking device...' : 'Verify your identity'}
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                fontSize: 15,
                textAlign: 'center',
                lineHeight: 22,
              }}
            >
              {gate.status === 'checking'
                ? 'Checking if biometric authentication is available.'
                : `Use your fingerprint or face ID to unlock BENBAX COMPANY LTD securely.`}
            </Text>
            {gate.status === 'prompting' ? (
              <Text
                style={{
                  color: theme.colors.primary,
                  fontSize: 13,
                  fontWeight: '700',
                  marginTop: 8,
                }}
              >
                A system prompt should appear above...
              </Text>
            ) : null}
          </View>
        ) : null}

        {gate.status === 'ready' ? (
          <View style={{ alignItems: 'center', gap: 16, width: '100%' }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '900',
                color: theme.colors.ink,
                textAlign: 'center',
              }}
            >
              Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                fontSize: 15,
                textAlign: 'center',
                lineHeight: 22,
              }}
            >
              Verify your identity to unlock your account securely.
            </Text>
            <Button
              label="Verify with biometrics"
              icon={<Fingerprint size={18} color="#fff" />}
              onPress={() => void promptBiometric()}
            />
            <Button label="Use password instead" onPress={handleUsePassword} variant="quiet" />
          </View>
        ) : null}

        {gate.status === 'unavailable' ? (
          <View style={{ alignItems: 'center', gap: 16, width: '100%' }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '900',
                color: theme.colors.ink,
                textAlign: 'center',
              }}
            >
              Biometrics unavailable
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                fontSize: 15,
                textAlign: 'center',
                lineHeight: 22,
              }}
            >
              {gate.reason}
            </Text>
            <Button
              label="Turn off biometric requirement"
              onPress={handleDisableBiometrics}
              variant="secondary"
            />
            <Button
              label="Sign out"
              icon={<LogOut size={18} color="#fff" />}
              onPress={handleUsePassword}
            />
          </View>
        ) : null}

        {gate.status === 'error' ? (
          <View style={{ alignItems: 'center', gap: 16, width: '100%' }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '900',
                color: theme.colors.ink,
                textAlign: 'center',
              }}
            >
              Verification failed
            </Text>
            <Text
              style={{
                color: theme.colors.danger,
                fontSize: 15,
                textAlign: 'center',
                lineHeight: 22,
              }}
            >
              {gate.message}
            </Text>
            <Button
              label="Try again"
              icon={<RefreshCw size={18} color="#fff" />}
              onPress={() => void promptBiometric()}
            />
            <Button
              label="Use password instead"
              icon={<LogOut size={18} color={theme.colors.ink} />}
              onPress={handleUsePassword}
              variant="secondary"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
