import { env } from '@/lib/env';
import { MessageTypes } from '@/lib/validation/schemas';
import { AiExtractionService, ExtractionContext } from './aiService';
import { validateExtraction, AiExtraction } from './aiSchemas';
import { ZodError } from 'zod';

/** AI settings: AI_* preferred, legacy OPENAI_* kept as fallback. */
function aiConfig() {
  return {
    apiKey: env.AI_API_KEY || env.OPENAI_API_KEY || '',
    baseUrl: (env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: env.AI_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

/**
 * The School Communication Intelligence Agent system prompt — a faithful,
 * operational encoding of the product rule set. Split into two parts only
 * to keep the source readable; the model receives one prompt. The output is
 * ALWAYS re-validated with Zod (aiSchemas.extractionSchema) before it is
 * trusted.
 */
const AGENT_PROMPT_PART1 = `You are a School Communication Intelligence Agent.

Your job is to analyse school-group messages (plain text, or an image of a notice/poster) and extract every piece of information relevant to the children described in the CHILD PROFILE. A message may contain information about multiple grades, classes and children — use the CHILD PROFILE (its grades/classes) to determine who is affected.

RESPONSIBILITIES
1. Determine relevance from the CHILD PROFILE. Do not assume a message is relevant merely because it was posted in the school group.
2. Identify the communication type: "messageType" is the single best-fitting value from KNOWN_MESSAGE_TYPES; "categories" lists every type that applies (a message can have multiple categories).
3. Extract projects, homework, tasks, events, payments, reminders and important general communications.
4. Extract explicit AND implied dates into "detectedDates", marking isDeadline=true for deadlines and false for event/activity dates.
5. Convert relative dates such as "tomorrow", "next Friday" and "next week" into absolute dates using MESSAGE_DATE.
6. Break projects and assignments into actionable tasks in projects[].tasks.
7. Identify deadlines and distinguish them from event dates ("deadline" vs "eventDate").
8. Identify required materials, preparation and parent actions as actionItems (types: BRING, PREPARE, PAY, SIGN, REGISTER, REPLY, WEAR, COMPLETE).
9. Identify people such as teachers ONLY when explicitly named.
10. Produce concise information suitable for storing in a database and displaying in a parent-facing school app.
`;
const AGENT_PROMPT_PART2 = `
IMPORTANT RULES
- Never invent information. If information is not present, use null (empty arrays for lists).
- Do not create a task unless the message implies that someone needs to do something.
- Distinguish between an ACTION REQUIRED FROM PARENT and an ACTION REQUIRED FROM CHILD via actionItems[].assignee.
- A message can have multiple categories and multiple tasks/events.
- Preserve the original meaning of the message; do not paraphrase into new claims.
- Dates must use ISO-8601 format YYYY-MM-DD. Times use 24-hour HH:MM.
- If a date is ambiguous, set that date to null and explain the ambiguity in that detectedDates entry's "notes" and in the top-level "dateNotes".
- "tomorrow" = MESSAGE_DATE + 1 day. "next Friday" = the Friday of the week after MESSAGE_DATE's week, unless the message clearly means otherwise.
- Do not duplicate information unnecessarily: "bring X" belongs in actionItems (type BRING) and as a plain material in requiredItems; project sub-tasks live ONLY in projects[].tasks.
- "grades" must contain names copied EXACTLY from CHILD_PROFILE.grades. Empty grades array + allGrades=true means the whole school. Set gradeAmbiguous=true when the target grade cannot be determined.
- "messageType" must be one of KNOWN_MESSAGE_TYPES, or null when nothing clearly fits — never invent a new key.
- "importance": 1 (trivial) to 10 (urgent/emergency), null when unclear.
- "needsReview": true when dates, relevance or classification are genuinely uncertain.
- "confidence" entries are floats 0-1.

Return ONLY valid JSON conforming to the schema below. No prose, no markdown fences, no explanation.

SCHEMA (use null / empty arrays for anything unknown):
{
  "messageType": string|null,
  "categories": string[],
  "grades": string[],
  "allGrades": boolean,
  "gradeAmbiguous": boolean,
  "classes": string[],
  "title": string|null,
  "summary": string|null,
  "eventDate": "YYYY-MM-DD"|null,
  "startTime": "HH:MM"|null,
  "endTime": "HH:MM"|null,
  "location": string|null,
  "deadline": "YYYY-MM-DD"|null,
  "amount": number|null,
  "currency": string|null,
  "requiredItems": string[],
  "actionItems": [{"type": "PAY|SIGN|BRING|REGISTER|REPLY|PREPARE|COMPLETE|WEAR|OTHER", "title": string, "description": string|null, "assignee": "PARENT|CHILD|TEACHER|UNKNOWN", "subject": string|null, "amount": number|null, "deadline": "YYYY-MM-DD"|null}],
  "projects": [{"title": string, "subject": string|null, "description": string|null, "assignedDate": "YYYY-MM-DD"|null, "dueDate": "YYYY-MM-DD"|null, "tasks": [{"title": string, "description": string|null, "dueDate": "YYYY-MM-DD"|null}]}],
  "detectedDates": [{"date": "YYYY-MM-DD"|null, "isDeadline": boolean, "context": string|null, "notes": string|null}],
  "people": [{"name": string, "role": string|null}],
  "dateNotes": string|null,
  "contactInformation": {"name": string|null, "phone": string|null, "email": string|null}|null,
  "registrationRequired": boolean|null,
  "permissionRequired": boolean|null,
  "importance": number|null,
  "shouldGenerateReminders": boolean,
  "needsReview": boolean,
  "confidence": {"overall": number, "grade": number, "eventDate": number, "deadline": number, "amount": number}
}`;

const SYSTEM_PROMPT = AGENT_PROMPT_PART1 + AGENT_PROMPT_PART2;

/**
 * Builds the user turn: MESSAGE_DATE, the CHILD PROFILE (school grades and
 * classes used as the relevance context), the configured message types and
 * the message text. When an image is available (poster/photo of the notice)
 * it is attached as a vision content part alongside the text.
 */
function buildUserTurn(text: string, context: ExtractionContext): unknown[] {
  const today = context.today ?? new Date();
  const payload = JSON.stringify({
    MESSAGE_DATE: today.toISOString().slice(0, 10),
    CHILD_PROFILE: {
      grades: context.gradeNames ?? [],
      classes: context.classNames ?? [],
    },
    KNOWN_MESSAGE_TYPES: MessageTypes,
    SOURCE_FILENAME: context.sourceFilename ?? null,
    MESSAGE_TEXT: text,
  });

  const content: unknown[] = [{ type: 'text', text: payload }];
  if (context.imageDataUrl) {
    content.push({ type: 'image_url', image_url: { url: context.imageDataUrl } });
  }
  return content;
}

export class RemoteAiExtractionService implements AiExtractionService {
  readonly provider = 'openai-compatible-vision';
  private readonly cfg = aiConfig();

  isAvailable(): boolean {
    return Boolean(this.cfg.apiKey);
  }

  async extract(text: string, context: ExtractionContext = {}): Promise<AiExtraction> {
    if (!this.isAvailable()) {
      throw new Error(
        'RemoteAiExtractionService is unavailable — set AI_MODE=remote and provide AI_API_KEY (or OPENAI_API_KEY).'
      );
    }
    const { apiKey, baseUrl, model } = this.cfg;

    const request = async (imageUrl: string | undefined): Promise<string> => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserTurn(text, { ...context, imageDataUrl: imageUrl }) },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`AI extraction failed (${res.status}): ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('AI returned no content.');
      return content;
    };

    let content: string;
    try {
      content = await request(context.imageDataUrl);
    } catch (err) {
      // Vision resilience: if attaching the image produced no content (some
      // models refuse or choke on a particular image), retry once with the
      // OCR text alone — never invent anything, just give the model a clean
      // chance with what it can reliably read.
      const isNoContent = err instanceof Error && /no content/i.test(err.message);
      if (context.imageDataUrl && isNoContent) {
        content = await request(undefined);
      } else {
        throw err;
      }
    }

    // Never trust model output directly - validate with Zod.
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('AI returned non-JSON output.');
    }
    try {
      return validateExtraction(parsed);
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new Error(`AI output failed schema validation: ${issues.slice(0, 400)}`);
      }
      throw err;
    }
  }
}
