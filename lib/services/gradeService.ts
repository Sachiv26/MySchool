import { prisma } from '@/lib/prisma';

/** Raw incoming file types are not validated here; Grades are configured by admins. */

export async function getSchoolGrades(schoolId: string) {
  return prisma.grade.findMany({
    where: { schoolId },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  });
}

/** Look up grade ids for a set of grade names within a school. */
export async function resolveGradeIds(
  schoolId: string,
  gradeNames: string[]
): Promise<{ id: string; name: string; matched: boolean }[]> {
  if (gradeNames.length === 0) return [];
  const grades = await prisma.grade.findMany({ where: { schoolId } });
  return gradeNames.map((name) => {
    const g = grades.find((gr) => gr.name.toLowerCase() === name.toLowerCase());
    return { id: g?.id ?? '', name, matched: Boolean(g) };
  });
}