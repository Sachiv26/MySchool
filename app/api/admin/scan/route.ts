import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { importIncomingFiles } from '@/lib/services/pipeline';
import { listIncomingFiles, getInboxPath } from '@/lib/services/fileScanner';

const bodySchema = z.object({ action: z.enum(['scan', 'process']) }).default({ action: 'process' });

/**
 * Folder processing endpoint.
 *  - action=scan    : dry-run listing of unimported inbox files
 *  - action=process : full ingestion (extract → OCR → AI → persist as PENDING review)
 */
export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await parseJson(req, bodySchema);

  if (body.action === 'scan') {
    const files = await listIncomingFiles();
    return Response.json({
      ok: true,
      folder: getInboxPath(true),
      found: files.length,
      files: files.map((f) => ({ name: f.name, type: f.extension, isImage: f.isImage })),
    });
  }

  const result = await importIncomingFiles(admin.schoolId, { actorUserId: admin.userId });
  return Response.json({
    ok: true,
    imported: result.imported,
    skipped: result.skipped,
    failed: result.failed,
    messages: result.messages,
  });
});
