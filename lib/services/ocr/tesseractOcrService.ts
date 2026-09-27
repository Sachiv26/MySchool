import { OcrResult, OcrService, fileExtension, IMAGE_EXTENSIONS } from './ocrService';
import { readSidecarText } from './devOcrService';

/**
 * Local OCR through Tesseract.js.
 *
 * Enabled with OCR_MODE=tesseract (`tesseract.js` is installed). The first run
 * downloads the `eng` trained-data (needs network) and caches it for later.
 *
 * Real-world school posters (neon text on dark backgrounds, display fonts,
 * sparse blocks) defeat a single naive pass, so we:
 *   1. preprocess with sharp when available — grayscale + contrast stretch,
 *      plus an inverted variant (light-on-dark posters read far better as
 *      dark-on-light). Falls back to the untouched original if sharp is not
 *      installed or the file cannot be decoded.
 *   2. run a few page-segmentation modes per variant and keep the richest
 *      reading (most real words; ties broken on confidence).
 *
 * The dev sidecar still short-circuits when present, keeping demos deterministic.
 */

// PSM 3: automatic page segmentation · 6: one uniform block · 11: sparse text.
const PSM_SPARSE = ['11'] as const;
const PSM_FULL = ['3', '6', '11'] as const;

interface WorkerLike {
  setParameters: (p: Record<string, unknown>) => Promise<unknown>;
  recognize: (image: string | Buffer) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
}

interface ImageVariant {
  image: string | Buffer;
  psms: readonly string[];
}

/** Dynamically load sharp; null when the optional native dependency is absent. */
async function loadSharp(): Promise<typeof import('sharp').default | null> {
  try {
    const mod = await import('sharp');
    return mod.default ?? null;
  } catch {
    return null;
  }
}

export class TesseractOcrService implements OcrService {
  readonly method = 'tesseract';
  private engine: Promise<WorkerLike> | null = null;

  supports(filePath: string): boolean {
    return IMAGE_EXTENSIONS.includes(fileExtension(filePath));
  }

  private getEngine(): Promise<WorkerLike> {
    if (!this.engine) {
      this.engine = import('tesseract.js').then((mod) => mod.createWorker('eng') as Promise<WorkerLike>);
      // Never cache a rejected promise — allow the next call to retry.
      this.engine.catch(() => {
        this.engine = null;
      });
    }
    return this.engine;
  }

  /**
   * Candidate readings: the untouched image plus preprocessed derivatives when
   * sharp is available (invert rescues light/neon-on-dark posters; the plain
   * contrast-stretched grayscale helps low-contrast scans). The source may be a
   * file path or an in-memory Buffer (WhatsApp media), which sharp and
   * tesseract both accept interchangeably.
   */
  private async buildVariants(source: string | Buffer): Promise<ImageVariant[]> {
    const variants: ImageVariant[] = [{ image: source, psms: PSM_SPARSE }];
    const sharp = await loadSharp();
    if (!sharp) return variants;
    try {
      const inverted = await sharp(source).grayscale().normalise().negate().png().toBuffer();
      variants.push({ image: inverted, psms: PSM_FULL });
      const boosted = await sharp(source).grayscale().normalise().png().toBuffer();
      variants.push({ image: boosted, psms: PSM_SPARSE });
    } catch {
      // Undecodable image — the original still runs.
    }
    return variants;
  }

  async recognize(filePath: string, mimeType?: string): Promise<OcrResult> {
    void mimeType;
    // Dev fallback: allow sidecar to short-circuit when present.
    const sidecar = await readSidecarText(filePath);
    if (sidecar) return { text: sidecar, confidence: 0.99, method: this.method };
    return this.recognizeBuffer(filePath);
  }

  async recognizeBuffer(source: string | Buffer): Promise<OcrResult> {
    try {
      const worker = await this.getEngine();
      const variants = await this.buildVariants(source);
      let best: OcrResult | null = null;
      for (const variant of variants) {
        for (const psm of variant.psms) {
          try {
            await worker.setParameters({ tessedit_pageseg_mode: psm });
            const { data } = await worker.recognize(variant.image);
            const text = data.text.trim();
            if (!text) continue;
            const candidate: OcrResult = { text, confidence: data.confidence / 100, method: this.method };
            if (!best || richer(candidate, best)) best = candidate;
            if ((best.confidence ?? 0) >= 0.9 && countWords(best.text) >= 12) return best; // good enough
          } catch {
            // Try the next segmentation mode / variant.
          }
        }
      }
      return best ?? { text: '', confidence: 0, method: this.method };
    } catch (err) {
      void err;
      return { text: '', confidence: 0, method: this.method };
    }
  }
}

/** Prefer the reading with the most real words; break ties on confidence. */
function richer(a: OcrResult, b: OcrResult): boolean {
  const wa = countWords(a.text);
  const wb = countWords(b.text);
  if (wa !== wb) return wa > wb;
  return (a.confidence ?? 0) > (b.confidence ?? 0);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

