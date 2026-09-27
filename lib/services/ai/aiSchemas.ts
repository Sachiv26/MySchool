import { z } from 'zod';
import { MessageTypes } from '@/lib/validation/schemas';

/**
 * Structured, validated output of the AI extraction layer.
 * The pipeline NEVER stores trust blindly: this schema is the single contract
 * every extraction path (rule-based dev extractor OR a hosted LLM) must satisfy.
 * Unknown fields must be left null rather than invented.
 */

export const aiActionItemSchema = z.object({
  type: z
    .enum(['PAY', 'SIGN', 'BRING', 'REGISTER', 'REPLY', 'PREPARE', 'COMPLETE', 'WEAR', 'OTHER'])
    .default('OTHER'),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  // Who the agent determined must act (rule 11): PARENT vs CHILD vs TEACHER.
  assignee: z.enum(['PARENT', 'CHILD', 'TEACHER', 'UNKNOWN']).default('UNKNOWN'),
  subject: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const aiContactSchema = z
  .object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD (ISO-8601 date part)

// Rule 6: projects/assignments broken down into actionable tasks.
export const aiProjectTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
});

export const aiProjectSchema = z.object({
  title: z.string().min(1),
  subject: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  assignedDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  tasks: z.array(aiProjectTaskSchema).default([]),
});

// Rules 4/5/7 + ambiguity rule: every date the agent found, flagged as event
// date vs deadline. Ambiguous dates stay null and are explained in `notes`
// (and summarised in the top-level `dateNotes`).
export const aiDetectedDateSchema = z.object({
  date: isoDate.nullable(),
  isDeadline: z.boolean().default(false),
  context: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Rule 9: people explicitly named in the message (teachers, coaches, ...).
export const aiPersonSchema = z.object({
  name: z.string().min(1),
  role: z.string().nullable().optional(),
});

/**
 * Treat an explicit `null` from the model the same as an omitted field.
 *
 * The agent prompt instructs the model to answer "null when unknown", so null is
 * legitimate, meaningful output — it means "not present in the message" rather
 * than "invalid". Rejecting it made every remote extraction fail validation and
 * mark the whole message FAILED. Coercing to the schema default keeps the
 * untrusted-output contract (a value is always produced) while honouring the
 * prompt.
 */
function nullishTo<T extends z.ZodTypeAny>(schema: T, fallback: z.input<T>) {
  return z.preprocess((v) => (v === null || v === undefined ? fallback : v), schema);
}

export const extractionSchema = z.object({
  // "null" means nothing clearly fits — the prompt allows it, so fall back to
  // the neutral OTHER rather than failing the whole message.
  messageType: nullishTo(z.enum(MessageTypes), 'OTHER'),
  // Detected grade names, e.g. ["Grade 4", "Grade 5"]. Empty array is valid and
  // means "applies to all grades".
  grades: z.array(z.string()),
  allGrades: z.boolean().default(false),
  gradeAmbiguous: z.boolean().default(false),

  title: z.string().nullable(),
  summary: z.string().nullable(),

  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), // YYYY-MM-DD, local
  startTime: z.string().nullable(), // HH:MM
  endTime: z.string().nullable(), // HH:MM
  location: z.string().nullable(),

  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), // YYYY-MM-DD
  amount: z.number().nonnegative().nullable(),
  currency: z.string().nullable(),

  requiredItems: z.array(z.string()).default([]),
  actionItems: z.array(aiActionItemSchema).default([]),
  contactInformation: aiContactSchema,

  // Rule 2: a message can have multiple categories — the primary one is
  // `messageType`; everything else that applies goes here.
  categories: z.array(z.enum(MessageTypes)).default([]),
  // Class mentions, e.g. "4B" (finer relevance than grade alone).
  classes: z.array(z.string()).default([]),
  // Rule 6: projects/assignments with their broken-down tasks.
  projects: z.array(aiProjectSchema).default([]),
  // Rules 4/5/7: every date found, event vs deadline, with ambiguity notes.
  detectedDates: z.array(aiDetectedDateSchema).default([]),
  // Rule 9: explicitly named people (teachers, coaches).
  people: z.array(aiPersonSchema).default([]),
  // Global explanation of ambiguous/unresolved dates (null when none).
  dateNotes: z.string().nullable(),

  registrationRequired: z.boolean().nullable(),
  permissionRequired: z.boolean().nullable(),
  // The prompt says "null when unclear" — treat that as the neutral 3.
  importance: nullishTo(z.number().int().min(1).max(10), 3),
  shouldGenerateReminders: z.boolean().default(true),

  needsReview: z.boolean().default(false),

  confidence: z.object({
    overall: z.number().min(0).max(1),
    grade: z.number().min(0).max(1),
    eventDate: z.number().min(0).max(1),
    deadline: z.number().min(0).max(1),
    amount: z.number().min(0).max(1),
  }),
});

export type AiExtraction = z.infer<typeof extractionSchema>;
export type AiActionItem = z.infer<typeof aiActionItemSchema>;
export type AiProject = z.infer<typeof aiProjectSchema>;
export type AiProjectTask = z.infer<typeof aiProjectTaskSchema>;
export type AiDetectedDate = z.infer<typeof aiDetectedDateSchema>;
export type AiPerson = z.infer<typeof aiPersonSchema>;

/** Validate + normalize raw, untrusted extraction output. Throws on invalid data. */
export function validateExtraction(input: unknown): AiExtraction {
  return extractionSchema.parse(input);
}

/** Safe variant that returns the error instead of throwing. */
export function tryValidateExtraction(input: unknown): { ok: true; data: AiExtraction } | { ok: false; error: string } {
  const res = extractionSchema.safeParse(input);
  if (res.success) return { ok: true, data: res.data };
  return { ok: false, error: res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}