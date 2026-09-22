import { Alert, Linking } from 'react-native';

const GHANA_COUNTRY_CODE = '233';
const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;

export const BENBAX_PHONE = '+233598204414';

export function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (typeof phone !== 'string') return null;

  const raw = phone.trim();
  if (!raw || raw.startsWith('google:') || raw.startsWith('deleted:')) return null;

  let digits = raw.replace(/\D/g, '');
  const hasInternationalPrefix = raw.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith(GHANA_COUNTRY_CODE)) {
    const national = digits.slice(GHANA_COUNTRY_CODE.length).replace(/^0/, '');
    return national.length === 9 ? `+${GHANA_COUNTRY_CODE}${national}` : null;
  }

  if (!hasInternationalPrefix && (digits.length === 9 || digits.length === 10)) {
    const national = digits.replace(/^0/, '');
    return national.length === 9 ? `+${GHANA_COUNTRY_CODE}${national}` : null;
  }

  if (
    hasInternationalPrefix &&
    digits.length >= MIN_E164_DIGITS &&
    digits.length <= MAX_E164_DIGITS
  ) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Explain a missing number instead of leaving a dead button, and offer the
 * support line so the passenger is never stranded with no way to reach anyone.
 */
function alertNumberMissing(contactLabel: string) {
  Alert.alert(
    'Contact unavailable',
    `Your ${contactLabel} has not shared a phone number yet. Benbax support can reach them for you.`,
    [
      { text: 'Close', style: 'cancel' },
      { text: 'Call support', onPress: () => callPhone(BENBAX_PHONE, 'support line') },
    ]
  );
}

export function callPhone(phone: string | null | undefined, contactLabel = 'contact') {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    alertNumberMissing(contactLabel);
    return;
  }

  // `Linking.canOpenURL` is deliberately not used as a gate. From Android 11
  // (API 30) package visibility hides the dialer from apps that have not
  // declared a `tel` intent under <queries>, so it answers "no" even on a
  // phone that can obviously place calls — which is what silently blocked
  // this button. `openURL` rejects only when nothing can really handle the
  // intent, so failure here is a true failure.
  Linking.openURL(`tel:${normalizedPhone}`).catch(() =>
    Alert.alert('Unable to call', `Dial ${normalizedPhone} from your phone app instead.`)
  );
}

export function openWhatsApp(
  phone: string | null | undefined,
  message?: string,
  contactLabel = 'contact'
) {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    alertNumberMissing(contactLabel);
    return;
  }

  const cleanPhone = normalizedPhone.slice(1);
  const encoded = message ? encodeURIComponent(message) : null;

  // Prefer the installed app, then fall back to the wa.me web hand-off, which
  // also works when WhatsApp Business is the installed variant.
  Linking.openURL(`whatsapp://send?phone=${cleanPhone}${encoded ? `&text=${encoded}` : ''}`)
    .catch(() => Linking.openURL(`https://wa.me/${cleanPhone}${encoded ? `?text=${encoded}` : ''}`))
    .catch(() =>
      Alert.alert(
        'WhatsApp unavailable',
        `WhatsApp could not be opened. You can message ${normalizedPhone} directly.`
      )
    );
}
