import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  OcrResult,
  OcrService,
  IMAGE_EXTENSIONS,
  fileExtension,
} from './ocrService';

/**
 * Development/local OCR provider.
 *
 * Real OCR requires a heavy local engine (Tesseract) or a cloud API key. For a
 * zero-dependency, fully offline demo we look for an optional "sidecar" text
 * file that shares the image's basename and ends with `.ocr.txt`:
 *
 *   incoming-messages/grade4-sports-day.jpg
 *   incoming-messages/grade4-sports-day.ocr.txt   <- contains the poster text
 *
 * When found, we treat it as a high-confidence OCR result so the whole pipeline
 * runs end-to-end. If it's absent we return empty text with confidence 0, which
 * causes the pipeline to mark the message NEEDS_REVIEW (safe default).
 *
 * Swap this for TesseractOcrService (OCR_MODE=tesseract) or a cloud provider
 * behind the same OcrService interface without touching the pipeline.
 */
export class DevOcrService implements OcrService {
  readonly method = 'dev-sidecar';

  supports(filePath: string): boolean {
    return IMAGE_EXTENSIONS.includes(fileExtension(filePath));
  }

  async recognize(filePath: string): Promise<OcrResult> {
    try {
      const dir = filePath.substring(0, filePath.lastIndexOf('.'));
      const sidecarPath = `${dir}.ocr.txt`;
      const text = (await readFile(sidecarPath, 'utf8')).trim();
      if (text.length > 0) {
        return { text, confidence: 0.99, method: this.method };
      }
    } catch {
      // No sidecar file — fall through to "no OCR result".
    }
    return { text: '', confidence: 0, method: this.method };
  }

  /** An in-memory image has no sidecar to sit next to, so there is no result. */
  async recognizeBuffer(_buffer: Buffer, _mimeType?: string): Promise<OcrResult> {
    void _buffer;
    void _mimeType;
    return { text: '', confidence: 0, method: this.method };
  }
}

/** Read a sidecar content file next to an image if one exists (shared util). */
export async function readSidecarText(imagePath: string): Promise<string | null> {
  const dir = imagePath.substring(0, imagePath.lastIndexOf('.'));
  try {
    const text = (await readFile(join(`${dir}.ocr.txt`), 'utf8')).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}