/**
 * Tests that the OCR pipeline keeps images on the low-confidence / needs-review
 * path when no sidecar is present, and uses the sidecar text when it exists.
 *
 * Fixtures are written to a temp dir rather than the (now removed) local
 * `incoming-messages/` folder, so the test does not depend on sample files
 * being checked in — the app no longer reads from that folder at all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DevOcrService } from '@/lib/services/ocr/devOcrService';

describe('DevOcrService', () => {
  const svc = new DevOcrService();
  let dir: string;
  let withSidecar: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ocr-test-'));
    withSidecar = join(dir, 'poster.jpg');
    await writeFile(withSidecar, 'not-a-real-image');
    await writeFile(join(dir, 'poster.ocr.txt'), 'Grade R Sports Day — Friday 12 March, 08:00.');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads a sidecar .ocr.txt as high confidence', async () => {
    const result = await svc.recognize(withSidecar);
    expect(result.text).toContain('Sports Day');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns empty text with zero confidence when no sidecar', async () => {
    const result = await svc.recognize(join(dir, 'missing-image.jpg'));
    expect(result.text).toBe('');
    expect(result.confidence).toBeLessThan(0.2);
  });

  it('returns no result for an in-memory image (no sidecar can exist)', async () => {
    const result = await svc.recognizeBuffer(Buffer.from('bytes'));
    expect(result.text).toBe('');
    expect(result.confidence).toBe(0);
  });

  it('reports support only for image files', () => {
    expect(svc.supports('foo.jpg')).toBe(true);
    expect(svc.supports('foo.txt')).toBe(false);
  });
});
