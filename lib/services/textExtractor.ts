import { readFile } from 'node:fs/promises';
import pdfParse from 'pdf-parse';
import { isTextFile, isPdfFile } from './ocr/ocrService';

export interface ExtractedSource {
  /** Raw text body for text/pdf; empty for images (they go through OCR). */
  text: string;
  /** For text/pdf: the content. For images: populated by OCR later. */
}
export interface SourceContent {
  rawContent: string | null;
  /** true when the file was an image that needs OCR. */
  isImage: boolean;
}

/**
 * Extract raw textual content from a file.
 * - txt/md : read as UTF-8
 * - pdf    : parse the first page (pdf-parse). May be empty for scanned PDFs.
 * - image  : no text here; OCR happens in the OCR service.
 */
export async function extractRawContent(filePath: string): Promise<SourceContent> {
  if (isTextFile(filePath)) {
    const buf = await readFile(filePath);
    // Decode as UTF-8; fall back to latin1 to avoid throwing on odd encodings.
    const text = buf.toString('utf8');
    return { rawContent: text, isImage: false };
  }

  if (isPdfFile(filePath)) {
    try {
      const buf = await readFile(filePath);
      const parsed = await pdfParse(buf);
      return { rawContent: parsed.text?.trim?.() ?? '', isImage: false };
    } catch (err) {
      void err;
      return { rawContent: null, isImage: false };
    }
  }

  // Image / everything else handled by OCR.
  return { rawContent: null, isImage: true };
}