import { prisma } from '@/lib/prisma';
import { ok } from '@/lib/api';

/** Public school list (id + name + grades) for parent registration. */
export const dynamic = 'force-dynamic';
export async function GET() {
  const schools = await prisma.school.findMany({
    select: { id: true, name: true, primaryColor: true, grades: { select: { id: true, name: true, order: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] } },
    orderBy: { name: 'asc' },
  });
  return ok({ schools });
}