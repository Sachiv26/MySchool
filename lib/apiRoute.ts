import { NextResponse } from 'next/server';
import { ZodError, ZodTypeAny, z } from 'zod';
import { AppError } from '@/lib/services/authorization';

/** Standard error mapping for every API route. */
export function toErrorResponse(err: unknown): NextResponse {
  console.error('[api] error:', err);
  if (err instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      { status: 400 }
    );
  }
  if (err instanceof AppError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  }
  return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
}

/** Wrap a route handler so thrown errors become consistent JSON responses. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Parse + validate a JSON request body against a Zod schema. */
export async function parseJson<T extends ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  return schema.parse(raw);
}

/** Parse + validate a multipart form request body (uploads). */
export async function parseForm<T extends ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  const form = await req.formData();
  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (value instanceof File) continue;
    raw[key] = value;
  }
  const fileEntry = form.get('file');
  if (fileEntry instanceof File) raw.file = fileEntry;
  return schema.parse(raw);
}
