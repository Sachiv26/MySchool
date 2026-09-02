import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';
import { isFeatureEnabled } from './featureFlags';

/**
 * Email notifications via SMTP. Enabled only when ALL of the following hold:
 *   - the `email-notifications` feature flag is on (env FT_EMAIL_NOTIFICATIONS
 *     or the DB FeatureFlag row — the default is now true), and
 *   - SMTP_HOST + SMTP_USER are configured in .env.
 * Sending is best-effort: failures are logged, never thrown to the caller.
 */

type Transporter = ReturnType<typeof nodemailer.createTransport>;

let cached: Transporter | null = null;

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter | null {
  if (cached) return cached;
  if (!smtpConfigured()) return null;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS },
  });
  return cached;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EmailData {
  title: string;
  body?: string;
  url?: string;
}

/** Send an email to a user's address (falls back to the school fan-out). */
export async function sendEmailToUser(userId: string, data: EmailData): Promise<void> {
  try {
    const enabled = await isFeatureEnabled('email-notifications');
    const tx = getTransporter();
    if (!enabled || !tx) return; // silent no-op when disabled/unconfigured

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user?.email) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a">` +
      `<h2 style="color:#0f766e">${escapeHtml(data.title)}</h2>` +
      (data.body ? `<p>${escapeHtml(data.body)}</p>` : '') +
      (data.url && appUrl
        ? `<p><a href="${appUrl}${escapeHtml(data.url)}" style="color:#0f766e;font-weight:600">View in MySchool Connect →</a></p>`
        : '') +
      `</div>`;

    await tx.sendMail({
      from: process.env.SMTP_FROM || 'MySchool Connect <noreply@example.com>',
      to: user.email,
      subject: data.title,
      html,
    });
  } catch (err) {
    console.error('[email] send failed', err);
  }
}