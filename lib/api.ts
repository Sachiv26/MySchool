import { NextResponse } from 'next/server';
import { ZodError, ZodSchema } from 'zod';
import { AppError } from '@/lib/services/authorization';

export function ok<T extends object>(data: T, init?: ResponseInit) {
  // Spread flat so clients read payload fields at the top level
  // (e.g. `{ ok: true, dashboard }`) — consistent with every page.
  return NextResponse.json({ ok: true, ...data }, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * Map thrown errors to consistent API responses.
 * AppError subclasses carry their own HTTP status (401/403/404/…);
 * ZodErrors become 400s; anything else is logged and returns a generic 500.
 */
export function handleError(e: unknown) {
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return fail(first?.message ?? 'Invalid input.', 400, { issues: e.issues });
  }
  if (e instanceof AppError) {
    return fail(e.message, e.status);
  }
  if (process.env.NODE_ENV !== 'production') {
    console.error('[api] Unhandled error:', e);
  }
  return fail('Something went wrong. Please try again.', 500);
}

/** Parse + validate the JSON request body against a schema. */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, res: fail('Invalid JSON body.', 400) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, res: handleError(parsed.error) };
  return { ok: true, data: parsed.data };
}

export const unauthorized = () => fail('Authentication required.', 401);
export const forbidden = (msg = 'You are not authorised.') => fail(msg, 403);