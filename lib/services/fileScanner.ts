import { readdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { INCOMING_DIR } from '@/lib/env';
import { isImageFile } from './ocr/ocrService';

export interface IncomingFile {
  name: string;
  absolutePath: string;
  extension: string;
  /** true when the pipeline should run OCR (image files). */
  isImage: boolean;
  /** true for sidecar OCR files that should never be imported themselves. */
  isSidecar: boolean;
}

const OCR_SIDECAR_SUFFIX = '.ocr.txt';

function absoluteIncomingDir(): string {
  return resolve(process.cwd(), INCOMING_DIR);
}

/** Supported incoming file extensions. */
export const SUPPORTED_EXTENSIONS = ['txt', 'md', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'];

/** List raw candidate files in the inbox (excluding directories & OCR sidecars). */
export async function listIncomingFiles(): Promise<IncomingFile[]> {
  const dir = absoluteIncomingDir();
  const entries = await readdir(dir, { withFileTypes: true }).catch(async () => {
    // Create the inbox folder on first use so Scan never fails on a missing dir.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    return [];
  });

  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const name = e.name;
      const ext = extname(name).replace('.', '').toLowerCase();
      const isSidecar = name.toLowerCase().endsWith(OCR_SIDECAR_SUFFIX);
      return {
        name,
        absolutePath: join(dir, name),
        extension: ext,
        isImage: isImageFile(name),
        isSidecar,
      };
    })
    .filter((f) => (SUPPORTED_EXTENSIONS.includes(f.extension) || f.isSidecar) && !f.isSidecar);
}

/** Directory of the inbox (exposed for admin display). */
export function getInboxPath(rel = true): string {
  return rel ? INCOMING_DIR : absoluteIncomingDir();
}

export function getSidecarPath(imageName: string): string {
  const dot = imageName.lastIndexOf('.');
  const base = dot === -1 ? imageName : imageName.slice(0, dot);
  return join(absoluteIncomingDir(), `${base}${OCR_SIDECAR_SUFFIX}`);
}