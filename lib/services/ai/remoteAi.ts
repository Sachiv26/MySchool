import { env } from '@/lib/env';
import { AiExtractionService, ExtractionContext } from './aiService';
import { validateExtraction, extractionSchema, AiExtraction } from './aiSchemas';

/**
 * Hosted LLM extractor (OpenAI-compatible chat completions with structured JSON).
 * Enabled by setting AI_MODE=remote and OPENAI_API_KEY.
 *
 * The model is asked for JSON matching extractionSchema.json() and the result is
 * ALWAYS re-validated with Zod before it is trusted. Invalid/malformed output is
 * folded back into an empty extraction that the admin review screen can fix.
 */
export class RemoteAiExtractionService implements AiExtractionService {
  readonly provider = 'openai';

  isAvailable(): boolean {
    return Boolean(env.AI_MODE === 'remote' && env.OPENAI_API_KEY);
  }

  async extract(text: string, context: ExtractionContext = {}): Promise<AiExtraction> {
    if (!this.isAvailable()) {
      throw new Error('RemoteAiExtractionService is unavailable (AI_MODE != remote or missing OPENAI_API_KEY).');
    }
    const jsonSchema = JSON.stringify(extractionSchema.strict().describe('Structured school-message extraction'), null, 2);
    const prompt = [
      'You extract structured information from school messages sent to parents via WhatsApp.',
      'IMPORTANT: never invent data. If a field is NOT stated, leave it null (or empty array).',
      'Resolve date phrases. Grade names must match the configured list exactly. Use "allGrades": true for all-parent messages.',
      `Configured grades: ${(context.gradeNames ?? []).join(', ') || '(none provided)'}`,
      'Return ONLY JSON matching this schema:',
      jsonSchema,
      '',
      'MESSAGE:',
      text,
    ].join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a precise extraction engine. Respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI extraction failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned no content.');

    // Never trust model output directly — validate with Zod.
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('OpenAI returned non-JSON output.');
    }
    return validateExtraction(parsed);
  }
}