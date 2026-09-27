/**
 * Phone number normalisation.
 *
 * WhatsApp addresses are E.164 without separators ("+27821234567"), while
 * `ParentProfile.mobile` and `School.phone` are free-text typed by humans
 * ("+27 82 123 4567", "082 123 4567"). Every comparison and send therefore
 * goes through `toE164` first.
 */

/** Default country code used when a local number omits one (South Africa). */
const DEFAULT_COUNTRY_CODE = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '27';

/**
 * Coerce a human-entered number into E.164 (`+<digits>`).
 *
 * Returns null when the input has no plausible number of digits. An explicit
 * leading `+` always wins; otherwise a local number gets its national trunk
 * prefix (`0`) dropped and the default country code prepended, unless it
 * already starts with that country code.
 */
export function toE164(input: string | null | undefined, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;

  const cc = defaultCountryCode.replace(/[^\d]/g, '');

  let e164: string;
  if (trimmed.startsWith('00')) {
    // "0044..." — the country code follows the international prefix.
    e164 = digits.slice(2);
  } else if (trimmed.startsWith('+')) {
    e164 = digits;
  } else if (digits.startsWith(cc)) {
    // Already international, just missing the plus.
    e164 = digits;
  } else {
    // Local national format: drop the trunk prefix before adding the code,
    // otherwise "0821234567" would become the nonsense "+270821234567".
    e164 = cc + digits.replace(/^0+/, '');
  }

  // E.164 is at most 15 digits; anything shorter is not a usable number.
  return e164.length >= 8 && e164.length <= 15 ? `+${e164}` : null;
}

/** True when two numbers refer to the same subscriber. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = toE164(a);
  const y = toE164(b);
  return Boolean(x && y && x === y);
}
