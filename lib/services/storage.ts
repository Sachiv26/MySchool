import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from '@/lib/env';

/**
 * Secure attachment storage.
 *
 * Files live under /data/uploads (outside /public), so Next.js NEVER serves
 * them statically. Downloading requires an authenticated API route that checks
 * that the caller is the uploader, an administrator of the related school, or
 * the parent linked to the absence/attachment.
 */

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

function uploadsRoot(): string {
  return join(process.cwd(), DATA_DIR, 'uploads');
}

export interface StoredUpload {
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  location: string; // relative path under /data/uploads
}

/** Validate + persist an uploaded File (sick note etc.). Throws on bad input. */
export async function saveUpload(file: File): Promise<StoredUpload> {
  if (!file || file.size === 0) throw new Error('Attachment is empty.');
  if (file.size > MAX_SIZE_BYTES) throw new Error('Attachment exceeds the 10 MB limit.');
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.includes(mime)) {
    throw new Error('Only JPG, PNG or PDF attachments are allowed.');
  }
  const ext = EXT_FOR_MIME[mime] ?? extname(file.name || '').toLowerCase();
  void file.name;
  const storedName = `${randomUUID()}${ext}`;
  const dateDir = join(uploadsRoot(), new Date().toISOString().slice(0, 7)); // yyyy-mm
  await mkdir(dateDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dateDir, storedName), buffer);
  return {
    originalName: sanitizeOriginalName(file.name),
    storedName,
    mimeType: mime,
    size: buffer.byteLength,
    location: join('uploads', new Date().toISOString().slice(0, 7), storedName),
  };
}

function sanitizeOriginalName(name: string): string {
  return (name || 'attachment').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
}

/** Read a stored attachment by its relative location. Enforces path traversal safety. */
export async function readStoredFile(location: string): Promise<Buffer> {
  const root = uploadsRoot();
  const full = join(root, location.replace(/^uploads[\\/]/, ''));
  if (!full.startsWith(root)) throw new Error('Invalid attachment path.');
  return readFile(full);
}
