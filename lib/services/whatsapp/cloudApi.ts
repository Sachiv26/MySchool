/**
 * WhatsApp Cloud API (Meta Graph API) client.
 *
 * Deliberately dependency-free — the whole surface we need is a handful of
 * REST calls, so plain `fetch` + `node:crypto` is enough.
 *
 * Endpoints used:
 *   POST /{phone-number-id}/messages   send a text message
 *   GET  /{media-id}                   media metadata (yields a short-lived URL)
 *   GET  /{media-url}                  the media bytes themselves
 *
 * The webhook receiver lives in `webhook.ts`; this module is only the client.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

const GRAPH_BASE = 'https://graph.facebook.com';

export interface WhatsAppConfig {
  verifyToken?: string;
  appSecret?: string;
  accessToken?: string;
  phoneNumberId?: string;
  apiVersion: string;
  maxMediaBytes: number;
}

/** Read WhatsApp settings from the environment, applying safe defaults. */
export function getWhatsAppConfig(): WhatsAppConfig {
  return {
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || undefined,
    appSecret: env.WHATSAPP_APP_SECRET || undefined,
    accessToken: env.WHATSAPP_ACCESS_TOKEN || undefined,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || undefined,
    apiVersion: env.WHATSAPP_API_VERSION || 'v21.0',
    maxMediaBytes: Number(env.WHATSAPP_MAX_MEDIA_BYTES) || 10 * 1024 * 1024,
  };
}

/** True when the credentials needed to actually talk to Meta are present. */
export function isWhatsAppConfigured(cfg = getWhatsAppConfig()): boolean {
  return Boolean(cfg.accessToken && cfg.phoneNumberId);
}

export class WhatsAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppConfigError';
  }
}

function requireConfig(cfg: WhatsAppConfig): { accessToken: string; phoneNumberId: string } {
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    throw new WhatsAppConfigError(
      'WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env.'
    );
  }
  return { accessToken: cfg.accessToken, phoneNumberId: cfg.phoneNumberId };
}

function graphUrl(cfg: WhatsAppConfig, path: string): string {
  return `${GRAPH_BASE}/${cfg.apiVersion}/${path.replace(/^\/+/, '')}`;
}

/**
 * Verify Meta's `X-Hub-Signature-256` header.
 *
 * The signature is `sha256=<hex>` of the RAW request body keyed by the app
 * secret. Verifying the raw bytes (not a re-serialised object) is essential —
 * any whitespace difference produces a different digest.
 *
 * When no app secret is configured we allow the request through so local
 * development works without Meta credentials. Production should always set it.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret) return true; // dev / unconfigured — see note above
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Result of a send attempt — `ok:false` carries the API error for logging. */
export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a plain-text WhatsApp message to a recipient.
 *
 * The recipient must be in E.164 form (e.g. "+27821234567") — see
 * `normalizePhone` in ./phone.
 */
export async function sendTextMessage(
  to: string,
  text: string,
  cfg: WhatsAppConfig = getWhatsAppConfig()
): Promise<SendResult> {
  const { accessToken, phoneNumberId } = requireConfig(cfg);
  // WhatsApp rejects empty bodies outright, so guard before spending a request.
  const body = text.trim();
  if (!body) return { ok: false, error: 'Refusing to send an empty WhatsApp message.' };

  try {
    const res = await fetch(graphUrl(cfg, `${phoneNumberId}/messages`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body },
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number };
    };

    if (!res.ok) {
      const detail = json.error?.message ?? `HTTP ${res.status}`;
      console.error('[whatsapp] send failed', res.status, json.error?.code ?? '', detail);
      return { ok: false, error: detail };
    }
    return { ok: true, messageId: json.messages?.[0]?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[whatsapp] send threw', message);
    return { ok: false, error: message };
  }
}

export interface MediaDownload {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Download an inbound media object by its id.
 *
 * Two calls are required: the id must first be resolved to a short-lived
 * download URL, and that URL must then be fetched with the same bearer token
 * (it is not a public link). The response is size-capped so a huge upload
 * cannot exhaust memory.
 */
export async function downloadMedia(
  mediaId: string,
  cfg: WhatsAppConfig = getWhatsAppConfig()
): Promise<MediaDownload | null> {
  const { accessToken } = requireConfig(cfg);

  try {
    const metaRes = await fetch(graphUrl(cfg, mediaId), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      console.error('[whatsapp] media metadata failed', metaRes.status);
      return null;
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };

    if (!meta.url) return null;
    // Trust the advertised size to bail out before reading the body.
    if (typeof meta.file_size === 'number' && meta.file_size > cfg.maxMediaBytes) {
      console.error('[whatsapp] media too large, skipping', meta.file_size);
      return null;
    }

    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!binRes.ok) {
      console.error('[whatsapp] media download failed', binRes.status);
      return null;
    }

    const buffer = Buffer.from(await binRes.arrayBuffer());
    if (buffer.length > cfg.maxMediaBytes) {
      console.error('[whatsapp] media exceeded size cap after download', buffer.length);
      return null;
    }

    const mimeType =
      binRes.headers.get('content-type')?.split(';')[0] ?? meta.mime_type ?? 'application/octet-stream';
    return { buffer, mimeType };
  } catch (err) {
    console.error('[whatsapp] media download threw', err);
    return null;
  }
}