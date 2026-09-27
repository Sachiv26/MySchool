/**
 * Tests for the pure pieces of the WhatsApp Cloud API integration:
 *   - phone normalisation (E.164 coercion, used for both routing and sending)
 *   - X-Hub-Signature-256 verification (the webhook's only authentication)
 *   - webhook payload flattening (Meta's deeply nested envelope -> our shape)
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { toE164, samePhone } from '@/lib/services/whatsapp/phone';
import { verifySignature } from '@/lib/services/whatsapp/cloudApi';
import { parseWebhookPayload, formatLocation } from '@/lib/services/whatsapp/webhook';

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------

describe('toE164', () => {
  it('keeps an already-international number', () => {
    expect(toE164('+27821234567')).toBe('+27821234567');
  });

  it('strips separators and spaces', () => {
    expect(toE164('+27 82 123 4567')).toBe('+27821234567');
  });

  it('adds the default country code to a local number', () => {
    expect(toE164('0821234567')).toBe('+27821234567');
  });

  it('does not double-prefix a number already starting with the country code', () => {
    expect(toE164('27821234567')).toBe('+27821234567');
  });

  it('treats a leading 00 as the international prefix', () => {
    expect(toE164('0027821234567')).toBe('+27821234567');
  });

  it('returns null for unusable input', () => {
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164('not a number')).toBeNull();
    // Too short to be a real subscriber number.
    expect(toE164('123')).toBeNull();
  });

  it('honours a different default country code', () => {
    expect(toE164('0612345678', '33')).toBe('+33612345678');
  });

  it('compares numbers written in different formats', () => {
    expect(samePhone('082 123 4567', '+27821234567')).toBe(true);
    expect(samePhone('0821234567', '+27829999999')).toBe(false);
    expect(samePhone(null, '+27821234567')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

describe('verifySignature', () => {
  const secret = 'test-app-secret';
  const body = JSON.stringify({ object: 'whatsapp_business_account' });
  const signature = `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

  it('accepts a correct signature', () => {
    expect(verifySignature(body, signature, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifySignature(body + ' ', signature, secret)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifySignature(body, signature, 'other-secret')).toBe(false);
  });

  it('rejects a missing or malformed header', () => {
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, 'deadbeef', secret)).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    // timingSafeEqual throws on a length mismatch â€” we must not.
    expect(verifySignature(body, 'sha256=abc', secret)).toBe(false);
  });

  it('allows the request when no app secret is configured (local dev)', () => {
    expect(verifySignature(body, null, undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Webhook payload parsing
// ---------------------------------------------------------------------------

/** Build a Meta-shaped webhook body, optionally with one extra message. */
function textWebhook(extra?: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '0',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '+27821000000', phone_number_id: '123456' },
              contacts: [{ profile: { name: 'Thandi Mokoena' }, wa_id: '27821234567' }],
              messages: [
                {
                  from: '27821234567',
                  id: 'wamid.ABC123',
                  timestamp: '1756339200',
                  type: 'text',
                  text: { body: 'Sports day is on Friday at 08:00.' },
                },
                ...(extra ? [extra] : []),
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('parseWebhookPayload', () => {
  it('flattens a text message', () => {
    const [msg] = parseWebhookPayload(textWebhook());
    expect(msg.id).toBe('wamid.ABC123');
    expect(msg.type).toBe('text');
    expect(msg.text).toBe('Sports day is on Friday at 08:00.');
    expect(msg.senderName).toBe('Thandi Mokoena');
    expect(msg.displayPhoneNumber).toBe('+27821000000');
    expect(msg.mediaId).toBeNull();
  });

  it('converts Meta epoch-seconds into a Date', () => {
    const [msg] = parseWebhookPayload(textWebhook());
    // 1756339200 == 2025-08-28T00:00:00Z
    expect(msg.timestamp?.toISOString()).toBe('2025-08-28T00:00:00.000Z');
  });

  it('reads an image message and its caption', () => {
    const msgs = parseWebhookPayload(
      textWebhook({
        from: '27821234567',
        id: 'wamid.IMG1',
        type: 'image',
        image: { id: 'media-123', mime_type: 'image/jpeg', caption: 'Grade 4 sports poster' },
      })
    );
    // The image is the appended (second) message.
    const img = msgs.find((m) => m.id === 'wamid.IMG1');
    expect(img?.type).toBe('image');
    expect(img?.mediaId).toBe('media-123');
    expect(img?.mediaMimeType).toBe('image/jpeg');
    expect(img?.text).toBe('Grade 4 sports poster');
  });

  it('returns an empty list for delivery-status callbacks', () => {
    const statusOnly = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '0',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { display_phone_number: '+27821000000' },
                statuses: [{ id: 'wamid.SENT', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    };
    expect(parseWebhookPayload(statusOnly)).toEqual([]);
  });

  it('ignores changes on fields other than messages', () => {
    const templateUpdate = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '0',
          changes: [
            {
              field: 'message_template_status_update',
              value: { event: 'APPROVED', message_template_id: 1 },
            },
          ],
        },
      ],
    };
    expect(parseWebhookPayload(templateUpdate)).toEqual([]);
  });

  it('skips messages Meta flagged with an error', () => {
    const msgs = parseWebhookPayload(
      textWebhook({ from: '27821234567', id: 'wamid.BAD', error: { code: 131048 } })
    );
    // Only the good message survives.
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('wamid.ABC123');
  });

  it('survives a malformed body without throwing', () => {
    expect(parseWebhookPayload({ nonsense: true })).toEqual([]);
    expect(parseWebhookPayload(null)).toEqual([]);
    expect(parseWebhookPayload('a string')).toEqual([]);
  });
});

describe('formatLocation', () => {
  it('renders a named address with coordinates', () => {
    expect(
      formatLocation({ name: 'School hall', address: '12 Main Rd', latitude: -33.9, longitude: 18.4 })
      // \u2014 in a double-quoted string is a real em dash, so this assertion does
      // not depend on the source file's own encoding.
    ).toBe("Location: School hall \u2014 12 Main Rd \u2014 (-33.9, 18.4)");
  });

  it('returns null when there is no usable location', () => {
    expect(formatLocation(null)).toBeNull();
    expect(formatLocation({})).toBeNull();
  });
});
