/**
 * Tests that the OCR pipeline keeps images on the low-confidence / needs-review
 * path when no sidecar is present, and uses the sidecar text when it exists.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DevOcrService } from '@/lib/services/ocr/devOcrService';

describe('DevOcrService', () => {
  const svc = new DevOcrService();

  it('reads a sidecar .ocr.txt as high confidence', async () => {
    const result = await svc.recognize('incoming-messages/grade-r-sports-day.jpg');
    expect(result.text).toContain('Sports Day');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns empty text with zero confidence when no sidecar', async () => {
    const result = await svc.recognize('incoming-messages/missing-image.jpg');
    expect(result.text).toBe('');
    expect(result.confidence).toBeLessThan(0.2);
  });

  it('reports support only for image files', () => {
    expect(svc.supports('foo.jpg')).toBe(true);
    expect(svc.supports('foo.txt')).toBe(false);
  });
});
