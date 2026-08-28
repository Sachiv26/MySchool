import { handler } from '@/lib/apiRoute';
import { readStoredFile } from '@/lib/services/storage';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError, NotFoundError, requireParentProfile } from '@/lib/services/authorization';

/**
 * Secure attachment download. Files are stored outside /public and are only
 * served to: the uploading user OR an admin of the school the absence belongs
 * to OR a parent linked to the absent child.
 */
export const GET = handler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSession();
    if (!session) throw new ForbiddenError('Sign in required.');
    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: { absence: { include: { child: true } } },
    });
    if (!attachment) throw new NotFoundError('Attachment not found.');

    let allowed = attachment.uploadedById === session.sub;
    if (!allowed) {
      if (session.role === 'ADMIN') {
        const membership = await prisma.schoolMembership.findFirst({
          where: { userId: session.sub, role: 'ADMIN', schoolId: attachment.absence?.child.schoolId },
        });
        allowed = Boolean(membership);
      }
      if (!allowed && session.role === 'PARENT') {
        const profile = await requireParentProfile(session.sub);
        allowed = Boolean(
          await prisma.parentChild.findFirst({
            where: { parentId: profile.id, childId: attachment.absence?.childId ?? 'none' },
          })
        );
      }
    }
    if (!allowed) throw new ForbiddenError('You may not view this document.');

    try {
      const buffer = await readStoredFile(attachment.location);
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': attachment.mimeType,
          'Content-Disposition': `inline; filename="${attachment.originalName.replace(/"/g, '')}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      throw new NotFoundError('File is missing from storage.');
    }
  }
);
