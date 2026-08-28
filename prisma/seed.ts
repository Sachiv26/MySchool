import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '../lib/auth/password';
import { DEFAULT_FEATURE_FLAGS, getAllDefaultFlags } from '../lib/services/featureFlags';
import { scheduleRemindersForPublishedMessage } from '../lib/services/reminderService';
import { MessageTypes } from '../lib/validation/schemas';

const prisma = new PrismaClient();

const DEMO_ADMIN_EMAIL = 'admin@myschool.edu';
const DEMO_ADMIN_PASSWORD = 'admin12345';
const DEMO_PARENT_EMAIL = 'parent@myschool.edu';
const DEMO_PARENT_PASSWORD = 'parent12345';

export const SCHOOL_CODE = 'SUNRISE';

async function seedConfig() {
  // Feature flags.
  const flags = getAllDefaultFlags();
  for (const f of flags) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      update: { enabled: f.enabled, description: f.description ?? DEFAULT_FEATURE_FLAGS[f.key as keyof typeof DEFAULT_FEATURE_FLAGS] },
      create: { key: f.key, enabled: f.enabled, description: f.description ?? DEFAULT_FEATURE_FLAGS[f.key as keyof typeof DEFAULT_FEATURE_FLAGS] },
    });
  }

  // Configurable message types.
  const typeMeta: Record<(typeof MessageTypes)[number], { label: string; color: string; priority: number }> = {
    GENERAL: { label: 'General', color: '#64748b', priority: 0 },
    EVENT: { label: 'Event', color: '#0d9488', priority: 2 },
    SPORTS: { label: 'Sports', color: '#0ea5e9', priority: 2 },
    SCHOOL_TRIP: { label: 'School Trip', color: '#8b5cf6', priority: 3 },
    PAYMENT: { label: 'Payment', color: '#f59e0b', priority: 4 },
    DEADLINE: { label: 'Deadline', color: '#ef4444', priority: 5 },
    REMINDER: { label: 'Reminder', color: '#84cc16', priority: 1 },
    ABSENCE: { label: 'Absence', color: '#ec4899', priority: 2 },
    EMERGENCY: { label: 'Emergency', color: '#dc2626', priority: 10 },
    SCHOOL_CLOSURE: { label: 'School Closure', color: '#7c3aed', priority: 9 },
    UNIFORM: { label: 'Uniform', color: '#14b8a6', priority: 2 },
    PERMISSION: { label: 'Permission', color: '#f97316', priority: 3 },
    HOMEWORK: { label: 'Homework', color: '#3b82f6', priority: 1 },
    OTHER: { label: 'Other', color: '#94a3b8', priority: 0 },
  };
  for (const key of MessageTypes) {
    const meta = typeMeta[key];
    await prisma.messageTypeOption.upsert({
      where: { key },
      update: { label: meta.label, color: meta.color, priority: meta.priority },
      create: { key, label: meta.label, color: meta.color, priority: meta.priority },
    });
  }

  // Configurable reminder rules.
  const rules = [
    { messageTypeKey: 'EVENT', anchor: 'eventDate', offsetDays: -7, timeOfDay: '07:30', type: 'UPCOMING', name: '1 week before event' },
    { messageTypeKey: 'EVENT', anchor: 'eventDate', offsetDays: -3, timeOfDay: '07:30', type: 'UPCOMING', name: '3 days before event' },
    { messageTypeKey: 'EVENT', anchor: 'eventDate', offsetDays: -1, timeOfDay: '07:30', type: 'UPCOMING', name: '1 day before event' },
    { messageTypeKey: 'EVENT', anchor: 'eventDate', offsetDays: 0, timeOfDay: '07:00', type: 'DUE', name: 'Morning of event' },
    { messageTypeKey: 'SPORTS', anchor: 'eventDate', offsetDays: -2, timeOfDay: '07:30', type: 'UPCOMING', name: '2 days before sports' },
    { messageTypeKey: 'SPORTS', anchor: 'eventDate', offsetDays: -1, timeOfDay: '07:30', type: 'UPCOMING', name: '1 day before sports' },
    { messageTypeKey: 'SCHOOL_TRIP', anchor: 'eventDate', offsetDays: -7, timeOfDay: '07:30', type: 'UPCOMING', name: '1 week before trip' },
    { messageTypeKey: 'PAYMENT', anchor: 'deadline', offsetDays: -14, timeOfDay: '08:00', type: 'UPCOMING', name: '14 days before due' },
    { messageTypeKey: 'PAYMENT', anchor: 'deadline', offsetDays: -7, timeOfDay: '08:00', type: 'UPCOMING', name: '7 days before due' },
    { messageTypeKey: 'PAYMENT', anchor: 'deadline', offsetDays: -3, timeOfDay: '08:00', type: 'UPCOMING', name: '3 days before due' },
    { messageTypeKey: 'PAYMENT', anchor: 'deadline', offsetDays: -1, timeOfDay: '08:00', type: 'DUE', name: '1 day before due' },
    { messageTypeKey: 'PAYMENT', anchor: 'deadline', offsetDays: 1, timeOfDay: '08:00', type: 'OVERDUE', name: 'Overdue' },
    { messageTypeKey: 'PERMISSION', anchor: 'deadline', offsetDays: -7, timeOfDay: '07:45', type: 'UPCOMING', name: '7 days before' },
    { messageTypeKey: 'PERMISSION', anchor: 'deadline', offsetDays: -3, timeOfDay: '07:45', type: 'UPCOMING', name: '3 days before' },
    { messageTypeKey: 'PERMISSION', anchor: 'deadline', offsetDays: -1, timeOfDay: '07:45', type: 'UPCOMING', name: '1 day before' },
    { messageTypeKey: 'DEADLINE', anchor: 'deadline', offsetDays: -3, timeOfDay: '08:00', type: 'UPCOMING', name: '3 days before deadline' },
    { messageTypeKey: 'DEADLINE', anchor: 'deadline', offsetDays: -1, timeOfDay: '08:00', type: 'DUE', name: '1 day before deadline' },
    { messageTypeKey: 'UNIFORM', anchor: 'deadline', offsetDays: -3, timeOfDay: '07:30', type: 'UPCOMING', name: 'Uniform 3 days before' },
  ];
  let order = 0;
  for (const r of rules) {
    order += 1;
    await prisma.reminderRule.upsert({
      where: { id: `rule-${r.messageTypeKey}-${r.offsetDays}-${r.anchor}` },
      update: { name: r.name },
      create: {
        id: `rule-${r.messageTypeKey}-${r.offsetDays}-${r.anchor}`,
        name: r.name,
        messageTypeKey: r.messageTypeKey,
        anchor: r.anchor,
        offsetDays: r.offsetDays,
        timeOfDay: r.timeOfDay,
        reminderType: r.type as never,
        isActive: true,
        order,
      },
    });
  }
}
async function seedSchoolAndUsers() {
  const school = await prisma.school.upsert({
    where: { code: SCHOOL_CODE },
    update: { name: 'Sunrise Primary School', phone: '+27 11 555 0188', email: 'office@sunrise.primary.edu' },
    create: { code: SCHOOL_CODE, name: 'Sunrise Primary School', phone: '+27 11 555 0188', email: 'office@sunrise.primary.edu', primaryColor: '#0f766e' },
  });

  const gradeNames = ['Grade R', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7'];
  const grades: Record<string, string> = {};
  for (let i = 0; i < gradeNames.length; i += 1) {
    const g = await prisma.grade.upsert({
      where: { schoolId_name: { schoolId: school.id, name: gradeNames[i] } },
      update: { order: i },
      create: { schoolId: school.id, name: gradeNames[i], order: i },
    });
    grades[gradeNames[i]] = g.id;
  }

  for (const [name, gradeId] of Object.entries(grades)) {
    const clsName = `${name.split(' ')[1]}A`;
    await prisma.class.upsert({
      where: { schoolId_gradeId_name: { schoolId: school.id, gradeId, name: clsName } },
      update: {},
      create: { schoolId: school.id, gradeId, name: clsName },
    });
  }

  const adminHash = await hashPassword(DEMO_ADMIN_PASSWORD);
  const adminUser = await prisma.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    update: {},
    create: { email: DEMO_ADMIN_EMAIL, name: 'Admin User', passwordHash: adminHash, role: 'ADMIN' },
  });
  await prisma.schoolMembership.upsert({
    where: { schoolId_userId_role: { schoolId: school.id, userId: adminUser.id, role: 'ADMIN' } },
    update: { isActive: true },
    create: { schoolId: school.id, userId: adminUser.id, role: 'ADMIN', isActive: true },
  });

  const parentHash = await hashPassword(DEMO_PARENT_PASSWORD);
  const parentUser = await prisma.user.upsert({
    where: { email: DEMO_PARENT_EMAIL },
    update: {},
    create: { email: DEMO_PARENT_EMAIL, name: 'Jane Doe', passwordHash: parentHash, role: 'PARENT' },
  });
  let profile = await prisma.parentProfile.findUnique({ where: { userId: parentUser.id } });
  if (!profile) {
    profile = await prisma.parentProfile.create({
      data: { userId: parentUser.id, name: 'Jane', surname: 'Doe', email: DEMO_PARENT_EMAIL, mobile: '+27 82 555 0142' },
    });
  }

  await ensureChild(profile.id, school.id, 'Sarah', 'Doe', grades['Grade 4'], '04A', '1042');
  await ensureChild(profile.id, school.id, 'John', 'Doe', grades['Grade 7'], '07A', '2051');

  return { school, grades, adminUser, parentUser, parentProfile: profile };
}

async function ensureChild(
  parentProfileId: string,
  schoolId: string,
  firstName: string,
  surname: string,
  gradeId: string,
  className: string,
  studentNumber: string
) {
  let child = await prisma.child.findFirst({ where: { studentNumber } });
  if (!child) {
    child = await prisma.child.create({
      data: { schoolId, firstName, surname, gradeId, studentNumber, classId: null },
    });
  }
  const rel = await prisma.parentChild.findFirst({ where: { parentId: parentProfileId, childId: child.id } });
  if (!rel) {
    await prisma.parentChild.create({ data: { parentId: parentProfileId, childId: child.id, relationship: 'MOTHER' } });
  }
  const cls = await prisma.class.findFirst({ where: { schoolId, name: className } });
  if (cls && !child.classId) {
    await prisma.child.update({ where: { id: child.id }, data: { classId: cls.id } });
  }
}

async function seedSampleMessages(schoolId: string, grades: Record<string, string>, parentProfileId: string) {
  const nowDate = new Date();
  const inDays = (n: number) => new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + n, 12);

  // Published sample message #1 — Grade 4 sports event.
  const m1 = await prisma.message.create({
    data: {
      schoolId,
      sourceFilename: 'seed-grade4-sports.txt',
      sourceType: 'txt',
      rawContent: 'Grade 4 Sports Day is on Friday. Please bring a hat and water bottle.',
      title: 'Sports Day',
      summary: 'Sports Day is on Friday for Grade 4. Bring a hat and water bottle.',
      messageTypeKey: 'SPORTS',
      eventDate: inDays(3),
      startTime: '08:30',
      endTime: '13:00',
      location: 'School sports fields',
      requiredItems: ['Please bring a hat and water bottle'],
      processingStatus: 'PROCESSED',
      needsReview: false,
      published: true,
      importance: 5,
      sourceDate: nowDate,
    },
  });
  await prisma.messageGrade.upsert({
    where: { messageId_gradeId: { messageId: m1.id, gradeId: grades['Grade 4'] } },
    update: {},
    create: { messageId: m1.id, gradeId: grades['Grade 4'] },
  });
  const ev1 = await prisma.schoolEvent.create({
    data: {
      schoolId,
      messageId: m1.id,
      title: 'Sports Day',
      description: m1.summary,
      eventDate: inDays(3),
      startTime: '08:30',
      endTime: '13:00',
      location: 'School sports fields',
      registrationRequired: true,
    },
  });
  await prisma.actionItem.create({
    data: { messageId: m1.id, type: 'BRING', title: 'Bring a hat and water bottle' },
  });
  await prisma.eventRegistration.create({
    data: { eventId: ev1.id, parentId: parentProfileId, childId: (await ensureChildId(schoolId, 'Sarah', 'Doe', grades['Grade 4'])), status: 'REGISTERED' },
  });

  // Published sample message #2 — all-school announcement.
  const m2 = await prisma.message.create({
    data: {
      schoolId,
      sourceFilename: 'seed-announcement.txt',
      sourceType: 'txt',
      rawContent: 'All parents please note: school will be closed on Monday next week for a public holiday.',
      title: 'School closed - public holiday',
      summary: 'School will be closed next Monday for a public holiday.',
      messageTypeKey: 'SCHOOL_CLOSURE',
      eventDate: inDays(6),
      processingStatus: 'PROCESSED',
      needsReview: false,
      published: true,
      importance: 8,
      sourceDate: nowDate,
    },
  });
  await prisma.schoolEvent.create({
    data: { schoolId, messageId: m2.id, title: 'School closed - public holiday', eventDate: inDays(6), isSchoolClosure: true },
  });

  // Published sample message #3 — Grade 7 payment request.
  const m3 = await prisma.message.create({
    data: {
      schoolId,
      sourceFilename: 'seed-payment.txt',
      sourceType: 'txt',
      rawContent: 'Grade 7 parents: Please pay R350 for the year-end outing by Friday.',
      title: 'Year-end outing payment',
      summary: 'Grade 7 parents please pay R350 for the year-end outing by Friday.',
      messageTypeKey: 'PAYMENT',
      deadline: inDays(10),
      amount: new Prisma.Decimal(350),
      currency: 'ZAR',
      processingStatus: 'PROCESSED',
      needsReview: false,
      published: true,
      importance: 7,
      sourceDate: nowDate,
    },
  });
  await prisma.messageGrade.upsert({
    where: { messageId_gradeId: { messageId: m3.id, gradeId: grades['Grade 7'] } },
    update: {},
    create: { messageId: m3.id, gradeId: grades['Grade 7'] },
  });
  await prisma.paymentRequest.create({
    data: { schoolId, messageId: m3.id, title: 'Year-end outing payment', amount: new Prisma.Decimal(350), currency: 'ZAR', dueDate: inDays(10) },
  });
  await prisma.actionItem.create({
    data: { messageId: m3.id, type: 'PAY', title: 'Pay R350 by the deadline', amount: new Prisma.Decimal(350), deadline: inDays(10) },
  });
}

async function ensureChildId(schoolId: string, firstName: string, surname: string, gradeId: string): Promise<string> {
  let child = await prisma.child.findFirst({ where: { schoolId, firstName, surname } });
  if (!child) {
    child = await prisma.child.create({ data: { schoolId, firstName, surname, gradeId } });
  }
  return child.id;
}

async function main() {
  await seedConfig();
  const { school, grades, parentProfile } = await seedSchoolAndUsers();
  await seedSampleMessages(school.id, grades, parentProfile.id);

  // Generate reminders for the seeded published messages (idempotent-ish).
  const published = await prisma.message.findMany({ where: { published: true } });
  for (const m of published) {
    await scheduleRemindersForPublishedMessage(m.id);
  }

  console.log('Seed complete.');
  console.log('  Admin  login:', DEMO_ADMIN_EMAIL, '/', DEMO_ADMIN_PASSWORD);
  console.log('  Parent login:', DEMO_PARENT_EMAIL, '/', DEMO_PARENT_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });