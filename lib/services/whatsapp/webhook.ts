/**
 * WhatsApp Cloud API webhook payload parsing.
 *
 * Meta POSTs a JSON body shaped like:
 *   { object: "whatsapp_business_account",
 *     entry: [{ id, changes: [{ field: "messages", value: {...} }] }] }
 *
 * The `value` object carries `metadata.display_phone_number` (which of our
 * business numbers was contacted), a `contacts[]` array, and `messages[]`.
 * We validate the parts we depend on with Zod and ignore everything else —
 * Meta sends status callbacks and template updates through the same endpoint.
 */
import { z } from 'zod';

const contactSchema = z.object({
  wa_id: z.string().optional(),
  profile: z.object({ name: z.string().optional() }).optional(),
});

const messageSchema = z.object({
  id: z.string(),
  from: z.string().optional(),
  timestamp: z.string().optional(),
  type: z.string().optional(),
  text: z.object({ body: z.string().optional() }).optional(),
  image: z.object({ id: z.string().optional(), mime_type: z.string().optional(), caption: z.string().optional() }).optional(),
  document: z.object({ id: z.string().optional(), mime_type: z.string().optional(), filename: z.string().optional(), caption: z.string().optional() }).optional(),
  location: z
    .object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  button: z.object({ text: z.string().optional() }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ id: z.string().optional(), title: z.string().optional() }).optional(),
      list_reply: z.object({ id: z.string().optional(), title: z.string().optional() }).optional(),
    })
    .optional(),
  // Errors echo the original message; useful for logging but not for ingest.
  error: z.unknown().optional(),
});

const valueSchema = z.object({
  messaging_product: z.string().optional(),
  metadata: z
    .object({
      display_phone_number: z.string().optional(),
      phone_number_id: z.string().optional(),
    })
    .optional(),
  contacts: z.array(contactSchema).optional(),
  messages: z.array(messageSchema).optional(),
  statuses: z.array(z.unknown()).optional(),
  errors: z.array(z.unknown()).optional(),
});


/** One inbound message, flattened out of Meta's nested envelope. */
export interface InboundWebhookMessage {
  /** Meta's wamid — stable and unique, used as our idempotency key. */
  id: string;
  /** Sender in E.164 (already normalised by the caller). */
  from: string | null;
  senderName: string | null;
  /** Our business number that was contacted, for school routing. */
  displayPhoneNumber: string | null;
  phoneNumberId: string | null;
  type: string;
  /** Message body / caption. */
  text: string | null;
  /** Media id to download, when the message carries an image or document. */
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  location: { latitude?: number; longitude?: number; name?: string; address?: string } | null;
  /** When Meta says it was sent. */
  timestamp: Date | null;
}

/**
 * Flatten a webhook body into the list of messages worth ingesting.
 *
 * Returns an empty array for anything that isn't an inbound user message —
 * delivery-status callbacks, template updates, and `messages` entries that
 * Meta flagged with an error are all skipped.
 */
export function parseWebhookPayload(body: unknown): InboundWebhookMessage[] {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[whatsapp] unrecognised webhook payload', parsed.error.issues);
    return [];
  }

  const out: InboundWebhookMessage[] = [];

  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      // Only the `messages` field carries inbound content we can ingest.
      if (change.field && change.field !== 'messages') continue;
      const value = change.value;
      if (!value) continue;

      const displayPhoneNumber = value.metadata?.display_phone_number ?? null;
      const phoneNumberId = value.metadata?.phone_number_id ?? null;

      for (const msg of value.messages ?? []) {
        // An errored message has no usable content; log it and move on so we
        // still return 2xx and Meta stops retrying.
        if (msg.error) {
          console.error('[whatsapp] inbound message reported an error', msg.id, msg.error);
          continue;
        }

        const contact = value.contacts?.find((c) => c.wa_id === msg.from);
        const media = msg.image ?? msg.document ?? undefined;

        // Quick replies / list replies carry their label as the text.
        const interactiveText =
          msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null;

        out.push({
          id: msg.id,
          from: msg.from ?? null,
          senderName: contact?.profile?.name ?? null,
          displayPhoneNumber,
          phoneNumberId,
          type: msg.type ?? 'unknown',
          text: msg.text?.body ?? media?.caption ?? msg.button?.text ?? interactiveText ?? null,
          mediaId: media?.id ?? null,
          mediaMimeType: media?.mime_type ?? null,
          mediaFilename: msg.document?.filename ?? null,
          location: msg.location ?? null,
          timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : null,
        });
      }
    }
  }

  return out;
}

/**
 * Render a shared location pin as text.
 *
 * Cloud API inbound locations have no image to OCR and the coordinates are
 * meaningless to a parent, so we turn them into a human-readable line that the
 * AI extractor can classify as a venue/address.
 */
export function formatLocation(loc: InboundWebhookMessage['location']): string | null {
  if (!loc) return null;
  const parts = [
    loc.name,
    loc.address,
    loc.latitude != null && loc.longitude != null ? `(${loc.latitude}, ${loc.longitude})` : null,
  ].filter(Boolean);
  return parts.length ? `Location: ${parts.join(' — ')}` : null;
}

const webhookSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z
          .array(z.object({ field: z.string().optional(), value: valueSchema }))
          .optional(),
      })
    )
    .optional(),
});