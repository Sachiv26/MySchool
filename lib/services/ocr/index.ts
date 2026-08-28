import { env } from '@/lib/env';
import { OcrService } from './ocrService';
import { DevOcrService } from './devOcrService';
import { TesseractOcrService } from './tesseractOcrService';

/**
 * Builds the active OcrService based on OCR_MODE.
 *
 *  dev        -> DevelopmentOcrService (offline sidecar-based; always works)
 *  tesseract  -> local tesseract engine (needs `npm i tesseract.js`)
 *  google/azure/aws -> unimplemented entries that describe how a provider
 *                      would be wired in; each would be its own class behind
 *                      the OcrService interface.
 *
 * This indirection is the single seam for adding a cloud OCR provider later.
 */
export function createOcrService(mode: string = env.OCR_MODE): OcrService {
  switch (mode) {
    case 'dev':
      return new DevOcrService();
    case 'tesseract':
      return new TesseractOcrService();
    case 'google':
      throw new OcrNotConfiguredError('Google Vision OCR is not configured. Implement GoogleVisionOcrService behind OcrService and set keys in .env.');
    case 'azure':
      throw new OcrNotConfiguredError('Azure OCR is not configured. Implement AzureOcrService behind OcrService and set keys in .env.');
    case 'aws':
      throw new OcrNotConfiguredError('AWS Textract is not configured. Implement AwsOcrService behind OcrService and set keys in .env.');
    default:
      return new DevOcrService();
  }
}

export class OcrNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrNotConfiguredError';
  }
}

/** Singleton handle used across the pipeline for a given boot. */
let instance: OcrService | null = null;
export function getOcrService(): OcrService {
  if (!instance) instance = createOcrService();
  return instance;
}

// Ensure a predictable provider when tests override OCR_MODE.
export function resetOcrService(): void {
  instance = null;
}