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

/**
 * Every stored representation a typed phone number could plausibly match.
 *
 * Numbers reached the database through several routes over time — the mobile
 * apps write normalized E.164, older seeds wrote `+233` glued onto the trunk
 * zero (`+2330594172522`), and hand-entered rows are sometimes plain local
 * form (`0594172522`). Sign-in must find the account whichever way it was
 * stored, so lookups match on all of them rather than one canonical spelling.
 *
 * Returns de-duplicated candidates, most canonical first. Empty for values
 * that are not phone-shaped at all (e.g. an email address).
 */
export function phoneLookupVariants(value: string | null | undefined): string[] {
  if (typeof value !== 'string') return [];
  const raw = value.trim();
  if (!raw || raw.includes('@')) return [];

  const candidates: string[] = [];
  const push = (candidate: string | null) => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };

  const e164 = normalizePhoneNumber(raw);
  push(e164);
  push(raw);

  if (e164) {
    const digits = e164.slice(1);
    // `+233594172522` -> `594172522`, the national number without the trunk zero.
    const national = digits.startsWith(GHANA_COUNTRY_CODE)
      ? digits.slice(GHANA_COUNTRY_CODE.length)
      : null;
    push(digits);
    if (national) {
      push(`0${national}`);
      push(national);
      // The malformed shape written by older seeds: country code + trunk zero.
      push(`+${GHANA_COUNTRY_CODE}0${national}`);
      push(`${GHANA_COUNTRY_CODE}0${national}`);
    }
  }

  return candidates;
}
