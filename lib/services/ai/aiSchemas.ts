import { z } from 'zod';
import { MessageTypes } from '@/lib/validation/schemas';

/**
 * Structured, validated output of the AI extraction layer.
 * The pipeline NEVER stores trust blindly: this schema is the single contract
 * every extraction path (rule-based dev extractor OR a hosted LLM) must satisfy.
 * Unknown fields must be left null rather than invented.
 */

export const aiActionItemSchema = z.object({
  type: z.enum(['PAY', 'SIGN', 'BRING', 'REGISTER', 'REPLY', 'OTHER']).default('OTHER'),
  title: z.string().min(1),
  amount: z.number().nullable().optional(),
  deadline: z.string().nullable().optional(),
});

export const aiContactSchema = z
  .object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

export const extractionSchema = z.object({
  messageType: z.enum(MessageTypes),
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

  registrationRequired: z.boolean().nullable(),
  permissionRequired: z.boolean().nullable(),
  importance: z.number().int().min(1).max(10).default(3),
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