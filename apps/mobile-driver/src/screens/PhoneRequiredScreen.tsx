import { LogOut, Phone } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { describeApiError } from '../services/api';
import { normalizePhoneNumber } from '../services/contact';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

/**
 * Collects a phone number for an account that has none.
 *
 * Google sign-in cannot supply one — Google's userinfo endpoint returns no
 * phone number under any scope — so those accounts are created with a
 * placeholder. A driver with no number cannot be called by the passenger they
 * are collecting, which is the one thing this job requires.
 *
 * It blocks the app before the driver can go online. Signing out stays
 * available so nobody is ever trapped here.
 */
export function PhoneRequiredScreen() {
  const { user, setPhone, logout } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [phone, setPhoneInput] = useState('+233');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validated on-device first so an obviously wrong number costs no round trip.
  const normalized = normalizePhoneNumber(phone);
  const canSubmit = normalized !== null && !saving;

  async function submit() {
    if (!normalized) {
      setError('Enter a valid phone number, for example 059 417 2522.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setPhone(normalized);
    } catch (err) {
      setError(describeApiError(err, 'Could not save your phone number.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{
        flex: 1,
        backgroundColor: theme.colors.canvas,
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 16,
      }}
    >
      <View style={{ gap: 20 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.colors.primary + '18',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Phone size={26} color={theme.colors.primary} />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>
            Add your phone number
          </Text>
          <Text style={{ fontSize: 15, color: theme.colors.muted, lineHeight: 21 }}>
            {user?.name ? `Almost there, ${user.name.split(' ')[0]}. ` : ''}
            Passengers call this number when they cannot find you at pickup, and we send trip alerts
            and password reset codes to it. Google sign-in does not share it with us.
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.ink, fontSize: 14, fontWeight: '800' }}>
            Phone number
          </Text>
          <TextInput
            value={phone}
            onChangeText={(next) => {
              setPhoneInput(next);
              if (error) setError(null);
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="+233 59 417 2522"
            placeholderTextColor={theme.colors.muted}
            accessibilityLabel="Phone number"
            editable={!saving}
            style={{
              backgroundColor: '#fff',
              borderRadius: 8,
              borderColor: error ? theme.colors.danger : theme.colors.border,
              borderWidth: 1,
              color: theme.colors.ink,
              fontSize: 16,
              minHeight: 58,
              paddingHorizontal: 14,
            }}
          />
          {error ? (
            <Text style={{ color: theme.colors.danger, fontSize: 13 }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>

        <Button
          label={saving ? 'Saving…' : 'Save and continue'}
          onPress={() => void submit()}
          disabled={!canSubmit}
          loading={saving}
        />

        <Pressable
          onPress={() => void logout()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 10,
          }}
        >
          <LogOut size={16} color={theme.colors.muted} />
          <Text style={{ color: theme.colors.muted, fontWeight: '700', fontSize: 14 }}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
