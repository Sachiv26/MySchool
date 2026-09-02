import { prisma } from '@/lib/prisma';
import { boolEnv } from '@/lib/env';

export type FeatureKey =
  | 'parent-chat'
  | 'payments'
  | 'whatsapp'
  | 'email-notifications'
  | 'sms'
  | 'teachers';

// Order matters: env overrides win, then DB flags, then these defaults.
const DEFAULT_FLAGS: Record<FeatureKey, boolean> = {
  'parent-chat': false,
  payments: true,
  whatsapp: false,
  'email-notifications': true,
  sms: false,
  teachers: false,
};

/** Mapping from a feature key to its optional env override variable. */
const ENV_KEYS: Record<FeatureKey, string | undefined> = {
  'parent-chat': 'FT_PARENT_CHAT',
  payments: 'FT_PAYMENTS',
  whatsapp: 'FT_WHATSAPP',
  'email-notifications': 'FT_EMAIL_NOTIFICATIONS',
  sms: 'FT_SMS',
  teachers: 'FT_TEACHERS',
};

/**
 * Feature flag evaluation.
 * 1. If an env override is set (e.g. FT_PAYMENTS), it wins — useful for tests.
 * 2. Otherwise consult the DB `FeatureFlag` table (editable by admins at runtime).
 * 3. Otherwise use the DEFAULT_FLAGS fallback.
 */
export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  const envKey = ENV_KEYS[key];
  if (envKey && process.env[envKey] !== undefined && process.env[envKey] !== '') {
    return boolEnv(process.env[envKey]);
  }
  try {
    const row = await prisma.featureFlag.findUnique({ where: { key } });
    if (row) return row.enabled;
  } catch {
    // DB not reachable — fall back to default rather than crashing.
  }
  return DEFAULT_FLAGS[key];
}

export const DEFAULT_FEATURE_FLAGS: Record<FeatureKey, string> = {
  'parent-chat': 'Peer-to-peer chat between parents (gated for MVP).',
  payments: 'Online payments (mock flow enabled by default for MVP).',
  whatsapp: 'WhatsApp ingestion/send integration (not enabled for MVP).',
  'email-notifications': 'Send notifications via email.',
  sms: 'Send notifications via SMS.',
  teachers: 'Enable teacher accounts and teacher features.',
};

export function getAllDefaultFlags(): { key: FeatureKey; enabled: boolean; description: string }[] {
  return (Object.keys(DEFAULT_FLAGS) as FeatureKey[]).map((key) => ({
    key,
    enabled: DEFAULT_FLAGS[key],
    description: DEFAULT_FEATURE_FLAGS[key] ?? '',
  }));
}