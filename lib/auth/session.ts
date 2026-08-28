import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { SESSION_COOKIE } from './constants';

export { SESSION_COOKIE };
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

type Role = 'PARENT' | 'TEACHER' | 'ADMIN';

export interface SessionPayload {
  sub: string; // user id
  email: string;
  role: Role;
  name: string;
}

const secret = () => new TextEncoder().encode(env.AUTH_SECRET ?? 'dev-secret');

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const claims: JWTPayload & SessionPayload = {
    ...payload,
    role: payload.role,
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .setSubject(payload.sub)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || !payload.role) return null;
    return {
      sub: payload.sub as string,
      email: (payload.email as string) ?? '',
      role: payload.role as Role,
      name: (payload.name as string) ?? '',
    };
  } catch {
    return null;
  }
}

/** Read and validate the session cookie. Returns null when unauthenticated. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Persist the session cookie on the response. */
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const store = cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = cookies();
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}