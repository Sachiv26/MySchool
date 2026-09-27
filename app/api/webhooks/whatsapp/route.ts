/**
 * WhatsApp Cloud API webhook.
 *
 * GET  — Meta's one-time endpoint verification handshake. Echo the `challenge`
 *        only when the verify token matches.
 * POST — inbound messages. Signature-verified against the app secret, then
 *        handed to the ingestion pipeline.
 *
 * This route is intentionally outside the session-based `middleware` matcher
 * (`/api` is excluded), because Meta calls it without a session cookie.
 * Authentication here is the verify token / HMAC signature instead.
 */
import { getWhatsAppConfig, verifySignature } from '@/lib/services/whatsapp/cloudApi';
import { ingestWebhookPayload } from '@/lib/services/whatsapp/inbound';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

/** Constant-time token comparison that tolerates length mismatches. */
function tokenMatches(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const cfg = getWhatsAppConfig();
  const url = new URL(req.url);

  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && tokenMatches(cfg.verifyToken, token)) {
    return new Response(challenge ?? '', { status: 200 });
  }

  // Wrong/missing token must NOT reveal the expected value.
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const cfg = getWhatsAppConfig();

  // The signature covers the exact bytes Meta sent, so read the raw body and
  // only parse it as JSON after verification.
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');

  if (!verifySignature(rawBody, signature, cfg.appSecret)) {
    console.warn('[whatsapp] rejected webhook with invalid signature');
    return Response.json({ ok: false, error: 'Invalid signature.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: 'Malformed JSON.' }, { status: 400 });
  }

  const summary = await ingestWebhookPayload(payload);

  // Always 2xx once the payload is authentic: a 5xx would make Meta redeliver
  // the batch, and per-message failures are already captured in `summary`.
  return Response.json({ ok: true, ...summary });
}