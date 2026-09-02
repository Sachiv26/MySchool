import { AiExtraction } from './aiSchemas';

export interface ExtractionContext {
  sourceFilename?: string;
  fileType?: string;
  schoolName?: string;
  /** Known grade names to match against (from the school's configured grades). */
  gradeNames?: string[];
  /** Known class names (e.g. "4B") for finer relevance matching. */
  classNames?: string[];
  /** Reference date for relative phrases like "Friday". Defaults to now. */
  today?: Date;
  /**
   * Optional data URL (data:image/jpeg;base64,...) of the source image.
   * Vision-capable remote extractors send it to the model directly; the
   * rule-based dev extractor ignores it and relies on OCR'd text.
   */
  imageDataUrl?: string;
}

export interface AiExtractionService {
  readonly provider: string;
  /** Analyse extracted message text and return validated structured JSON. */
  extract(text: string, context?: ExtractionContext): Promise<AiExtraction>;
  /** True if the service is actually usable (e.g. valid API key present). */
  isAvailable(): boolean;
}