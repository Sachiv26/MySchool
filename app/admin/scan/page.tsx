'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { EmptyState, LoadingRows, ErrorBox, SubmitButton } from '@/components/ui';
import { apiGet, apiSend, fmtDateShort } from '@/lib/client/api';

interface InboxFile {
  name: string;
  type: string;
  isImage: boolean;
}

interface ProcessedMessage {
  id: string;
  sourceFilename: string;
  messageTypeKey: string | null;
  title: string | null;
  needsReview: boolean;
}

export default function ScanPage() {
  const [scan, setScan] = useState<{ folder: string; found: number; files: InboxFile[] } | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number; failed: number; messages: ProcessedMessage[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

    const scanFolder = () =>
    apiSend<{ ok: true; folder: string; found: number; files: InboxFile[] }>('/api/admin/scan', { action: 'scan' })
      .then((d) => setScan({ folder: d.folder, found: d.found, files: d.files }))
      .catch((e) => setError(e.message));

  useEffect(() => { scanFolder(); }, []);

  const run = async () => {
    setLoading(true);
    try {
      const res = await apiSend<{
        ok: true;
        imported: number;
        skipped: number;
        failed: number;
        messages: ProcessedMessage[];
      }>('/api/admin/scan', { action: 'process' });
      setResult({ imported: res.imported, skipped: res.skipped, failed: res.failed, messages: res.messages });
      await scanFolder();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminShell title="Process new messages">
      {error && <ErrorBox message={error} />}

      <div className="space-y-4">
        <div className="card flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Inbox: <span className="font-mono">{scan?.folder ?? '...'}</span> · {scan?.found ?? '...'} candidate(s) found
          </p>
          <SubmitButton onClick={run} pending={loading}>Run processing</SubmitButton>
        </div>

        {scan && (
          <div className="card">
            <h3 className="mb-2 text-sm font-bold uppercase text-slate-500">Candidates</h3>
            {scan.files.length === 0 ? (
              <EmptyState icon="📁" title="Nothing new in /incoming-messages" />
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th>Filename</th><th>Type</th><th>OCR?</th></tr></thead>
                <tbody>
                  {scan.files.map((f) => (
                    <tr key={f.name} className="border-t border-slate-200">
                      <td className="py-1">{f.name}</td>
                      <td className="py-1">{f.type}</td>
                      <td className="py-1">{f.isImage ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {result && (
          <div className="card">
            <h3 className="mb-2 text-sm font-bold uppercase text-slate-500">Results</h3>
            <p className="text-sm text-slate-600">
              Imported: <strong>{result.imported}</strong> · Skipped: <strong>{result.skipped}</strong> · Failed: <strong>{result.failed}</strong>
            </p>
            {result.messages.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {result.messages.map((m) => (
                  <li key={m.id} className="flex justify-between">
                    <span>{m.sourceFilename} — {m.title ?? m.messageTypeKey ?? 'Untitled'}</span>
                    <a href={`/admin/review/${m.id}`} className="text-brand-700 hover:underline">review →</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
