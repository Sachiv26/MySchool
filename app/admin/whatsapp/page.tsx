'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
import { ErrorBox, SubmitButton } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/client/api';

interface WhatsAppStatus {
  enabled: boolean;
  credentialsConfigured: boolean;
  accessTokenHint: string | null;
  phoneNumberId: string | null;
  apiVersion: string;
  signatureVerification: boolean;
  schoolNumber: string | null;
  schoolNumberValid: boolean;
  ready: boolean;
  receivedMessages: number;
  lastReceivedAt: string | null;
  lastReceivedFrom: string | null;
  lastProcessedAt: string | null;
  webhookPath: string;
}

/**
 * WhatsApp inbox status.
 *
 * Messages now arrive through the WhatsApp Cloud API webhook rather than from
 * a watched folder, so there is nothing to "scan" - this page instead shows
 * whether the connection is wired up correctly and lets an admin link the
 * school's business number.
 */
export default function WhatsAppPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Host and relative times depend on the browser, so they are only known after
  // mount. Rendering them during SSR would produce a hydration mismatch.
  const [host, setHost] = useState('');

  const load = () =>
    apiGet<WhatsAppStatus>('/api/admin/whatsapp')
      .then((d) => {
        setStatus(d);
        setNumber(d.schoolNumber ?? '');
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    setHost(window.location.host);
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiSend('/api/admin/whatsapp', { whatsappNumber: number }, 'PATCH');
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the number.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell title="WhatsApp">
      {error && <ErrorBox message={error} />}

      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase text-slate-500">Status</h3>
              <p className="mt-1 text-2xl font-bold">
                {status?.ready ? (
                  <span className="text-emerald-700">Connected</span>
                ) : (
                  <span className="text-amber-700">Not ready</span>
                )}
              </p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p>
                <Link
                  href="/admin/messages?source=whatsapp&status=all"
                  className="font-semibold text-brand-700 hover:underline"
                >
                  <strong>{status?.receivedMessages ?? 0}</strong> message(s) received
                </Link>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {status?.lastReceivedAt ? (
                  <>
                    Last one from {status.lastReceivedFrom ?? 'unknown'}
                    {host ? ` · ${fmtWhen(status.lastReceivedAt)}` : null}
                  </>
                ) : (
                  'No messages have arrived yet'
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="card space-y-2 text-sm">
          <h3 className="text-sm font-bold uppercase text-slate-500">Checklist</h3>
          <Check ok={status?.enabled} label="Feature flag 'whatsapp' is enabled" />
          <Check
            ok={status?.credentialsConfigured}
            label="Meta credentials set (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID)"
          />
          <Check ok={status?.signatureVerification} label="App secret set - webhooks are signature-verified" />
          <Check ok={status?.schoolNumberValid} label="This school has a valid WhatsApp number linked" />
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-bold uppercase text-slate-500">School WhatsApp number</h3>
          <p className="text-sm text-slate-600">
            The business number parents message. Inbound messages are routed to a school by matching
            this against the number Meta reports as contacted.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={number}
              onChange={(e) => {
                setNumber(e.target.value);
                setSaved(false);
              }}
              placeholder="+27 82 123 4567"
              className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <SubmitButton onClick={save} pending={saving}>
              Save
            </SubmitButton>
            {saved && <span className="text-sm text-emerald-700">Saved.</span>}
          </div>
        </div>

        <div className="card space-y-2 text-sm">
          <h3 className="text-sm font-bold uppercase text-slate-500">Meta configuration</h3>
          <Row label="Webhook path" value={status?.webhookPath} mono />
          <Row label="Phone number ID" value={status?.phoneNumberId ?? 'not set'} mono />
          <Row label="Access token" value={status?.accessTokenHint ?? 'not set'} mono />
          <Row label="Graph API version" value={status?.apiVersion} mono />
          <p className="pt-1 text-xs text-slate-500">
            In the Meta app dashboard, subscribe the <code>messages</code> webhook field and point it
            at <code>/api/webhooks/whatsapp</code>. Meta sends a verification request that this
            endpoint answers using <code>WHATSAPP_VERIFY_TOKEN</code>.
          </p>
          <p className="text-xs text-slate-500">
            <strong className="text-slate-700">Callback URL must be your public host + the path:</strong>{' '}
            {host ? (
              <code className="break-all">{`https://${host}${status?.webhookPath ?? ''}`}</code>
            ) : (
              <code className="break-all">
                {`https://<your public host>${status?.webhookPath ?? ''}`}
              </code>
            )}
          </p>
        </div>
      </div>
    </AdminShell>
  );
}

/** Short relative age, e.g. "2 minutes ago". Absolute time for anything older. */
function fmtWhen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleString();
}

function Check({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <p className="flex items-center gap-2">
      <span className={ok ? 'text-emerald-600' : 'text-slate-400'}>{ok ? 'OK' : '--'}</span>
      <span className={ok ? 'text-slate-700' : 'text-slate-500'}>{label}</span>
    </p>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-slate-600">{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'font-medium'}>{value ?? 'n/a'}</span>
    </p>
  );
}