import { AiExtraction } from './aiSchemas';

export interface ExtractionContext {
  sourceFilename?: string;
  fileType?: string;
  schoolName?: string;
  /** Known grade names to match against (from the school's configured grades). */
  gradeNames?: string[];
  /** Reference date for relative phrases like "Friday". Defaults to now. */
  today?: Date;
}

export interface AiExtractionService {
  readonly provider: string;
  /** Analyse extracted message text and return validated structured JSON. */
  extract(text: string, context?: ExtractionContext): Promise<AiExtraction>;
  /** True if the service is actually usable (e.g. valid API key present). */
  isAvailable(): boolean;
}