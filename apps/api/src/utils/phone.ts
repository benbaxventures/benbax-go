const GHANA_COUNTRY_CODE = '233';
const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;

/**
 * Return a dialable E.164 number. Ghana local numbers are converted to +233
 * and the trunk zero is removed, so values such as +2330501234567 do not leak
 * into call or WhatsApp links.
 */
export function normalizePhoneNumber(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw || raw.startsWith('google:') || raw.startsWith('deleted:')) return null;

  let digits = raw.replace(/\D/g, '');
  const hasInternationalPrefix = raw.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith(GHANA_COUNTRY_CODE)) {
    const national = digits.slice(GHANA_COUNTRY_CODE.length).replace(/^0/, '');
    return national.length === 9 ? `+${GHANA_COUNTRY_CODE}${national}` : null;
  }

  // The request and driver apps are Ghana-first, so an unprefixed number is a
  // Ghana national number rather than an ambiguous international number.
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
