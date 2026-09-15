import { Alert, Linking } from 'react-native';

const GHANA_COUNTRY_CODE = '233';
const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;

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

export function callPhone(phone: string | null | undefined) {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    Alert.alert('Contact unavailable', 'A valid contact phone number is not available yet.');
    return;
  }

  const url = `tel:${normalizedPhone}`;
  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) return Linking.openURL(url);
      Alert.alert(
        'Unable to call',
        `Phone calls are not supported on this device. Number: ${normalizedPhone}`
      );
    })
    .catch(() => Alert.alert('Error', 'Could not initiate the call.'));
}

export function openWhatsApp(phone: string | null | undefined, message?: string) {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    Alert.alert('Contact unavailable', 'A valid contact phone number is not available yet.');
    return;
  }

  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  const cleanPhone = normalizedPhone.slice(1);
  const waUrl = `https://wa.me/${cleanPhone}${text}`;

  Linking.openURL(waUrl).catch(() => {
    Alert.alert('WhatsApp not found', 'WhatsApp is not installed on this device.');
  });
}

export const BENBAX_PHONE = '+233598204414';
