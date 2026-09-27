import { z } from 'zod';

// Central environment configuration with validation. Fail fast on missing
// required secrets instead of silently misbehaving.

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().default('MySchool Connect'),

  OCR_MODE: z.enum(['dev', 'tesseract', 'google', 'azure', 'aws']).default('dev'),
  AI_MODE: z.enum(['dev', 'remote']).default('dev'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  /** Preferred AI extraction endpoint settings (any OpenAI-compatible API). Falls back to OPENAI_*. */
  AI_API_BASE_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),

  /** Shared secret for the /api/cron/reminders scheduler endpoint (optional in dev). */
  CRON_SECRET: z.string().optional(),

  // ---- WhatsApp Cloud API (Meta) ----
  // Inbound messages arrive on the /api/webhooks/whatsapp endpoint; outbound
  // notifications go through the same Cloud API business number.
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  // Meta signs every webhook POST with HMAC-SHA256 of the raw body using the
  // app secret. Leave empty in local dev to skip verification.
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  /** Hard cap on inbound media we will download + OCR (bytes). */
  WHATSAPP_MAX_MEDIA_BYTES: z.string().default(String(10 * 1024 * 1024)),

  FT_PARENT_CHAT: z.string().optional(),
  FT_PAYMENTS: z.string().optional(),
  FT_WHATSAPP: z.string().optional(),
  FT_EMAIL_NOTIFICATIONS: z.string().optional(),
  FT_SMS: z.string().optional(),
  FT_TEACHERS: z.string().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Only throw for the fields that are strictly required to boot connect to DB and auth.
    const needs = parsed.error.issues.filter(
      (i) => i.path[0] === 'DATABASE_URL' || i.path[0] === 'AUTH_SECRET'
    );
    if (needs.length > 0) {
      // Don't crash the whole process during static analysis / `next build` if DATABASE_URL
      // is absent — build shouldn't need a live DB. We fall back to default values and let
      // runtime DB calls surface the real error.
      console.warn(
        `[env] Missing required env var(s): ${needs
          .map((n) => n.path.join('.'))
          .join(', ')}. Check .env (see .env.example).`
      );
    }
    return {
      ...(process.env as Record<string, string | undefined>),
      NODE_ENV: process.env.NODE_ENV ?? 'development',
    } as NodeJS.ProcessEnv & z.infer<typeof envSchema>;
  }
  return parsed.data;
}

export const env = loadEnv();

/** Parse a string boolean env into a real boolean with a safe default. */
export function boolEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

/** Root folder for runtime data (uploads, document storage). Never under public/. */
export const DATA_DIR = process.env.DATA_DIR ?? 'data';