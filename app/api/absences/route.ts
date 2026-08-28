import { handler } from '@/lib/apiRoute';
import { createAbsenceSchema } from '@/lib/validation/schemas';
import { createAbsence } from '@/lib/services/absenceService';
import { listAbsencesForParent } from '@/lib/services/parentViews';
import { saveUpload } from '@/lib/services/storage';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/session';
import {
  ForbiddenError,
  getParentChildren,
  requireParentProfile,
} from '@/lib/services/authorization';
import { isoDateTime } from '@/lib/utils/serialize';

/** GET: this parent's absence history. */
export const GET = handler(async () => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const rows = await listAbsencesForParent(session.sub);
  return Response.json({
    ok: true,
    absences: rows.map((a) => ({
      id: a.id,
      childName: `${a.child.firstName} ${a.child.surname}`,
      gradeName: a.child.grade.name,
      date: isoDateTime(a.date),
      reason: a.reason,
      notes: a.notes,
      status: a.status,
      hasAttachment: Boolean(a.attachment),
      submittedAt: isoDateTime(a.createdAt),
    })),
  });
});

/**
 * POST: report an absence (multipart/form-data so a sick note can be attached).
 * The child must be linked to the authenticated parent — enforced server-side.
 */
export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');

  const form = await req.formData();
  const fileEntry = form.get('file');
  const raw = Object.fromEntries(
    [...form.entries()].filter(([, v]) => !(v instanceof File))
  ) as Record<string, string>;

  const input = createAbsenceSchema.parse({
    childId: raw.childId,
    date: raw.date,
    reason: raw.reason,
    notes: raw.notes || undefined,
  });

  // Ownership check against real relationships.
  const profile = await requireParentProfile(session.sub);
  const children = await getParentChildren(profile.id);
  const child = children.find((c) => c.id === input.childId);
  if (!child) throw new ForbiddenError('You can only report absences for your own children.');

  const absence = await createAbsence({
    parentProfileId: profile.id,
    userId: session.sub,
    childId: input.childId,
    date: input.date,
    reason: input.reason,
    notes: input.notes ?? null,
  });

  // Optional secure attachment (sick note).
  let attachmentId: string | null = null;
  if (fileEntry instanceof File && fileEntry.size > 0) {
    const stored = await saveUpload(fileEntry);
    const record = await prisma.attachment.create({
      data: {
        originalName: stored.originalName,
        storedName: stored.storedName,
        mimeType: stored.mimeType,
        size: stored.size,
        category: 'SICK_NOTE',
        location: stored.location,
        uploadedById: session.sub,
        absenceId: absence.id,
      },
    });
    attachmentId = record.id;
  }

  return Response.json({ ok: true, absenceId: absence.id, attachmentId }, { status: 201 });
});
