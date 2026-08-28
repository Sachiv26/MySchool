/**
 * OCR abstraction. The rest of the application depends only on this interface,
 * so a provider swap (Tesseract / Google Vision / Azure / AWS Textract) never
 * touches the ingestion pipeline.
 */

export interface OcrResult {
  text: string;
  confidence: number | null; // 0..1, null when not computable
  method: string; // machine-readable provider tag
}

export interface OcrService {
  /** Extract text from a supported image file. Returns empty text when OCR fails. */
  recognize(filePath: string, mimeType?: string): Promise<OcrResult>;
  /** True when the service can plausibly extract text from the given file. */
  supports(filePath: string): boolean;
}

// File extensions the services agree are image inputs.
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
export const DOC_EXTENSIONS = ['txt', 'md', 'pdf'];

export function fileExtension(filePath: string): string {
  const idx = filePath.lastIndexOf('.');
  if (idx === -1) return '';
  return filePath.slice(idx + 1).toLowerCase();
}

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.includes(fileExtension(filePath));
}

export function isTextFile(filePath: string): boolean {
  const ext = fileExtension(filePath);
  return ext === 'txt' || ext === 'md';
}

export function isPdfFile(filePath: string): boolean {
  return fileExtension(filePath) === 'pdf';
}