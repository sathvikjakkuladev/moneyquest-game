// HTTP helpers: JSON responses, errors, body limits, and the origin allowlist (CORS and WebSockets).
import type { Env } from './env.ts';

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Exact allowlist, plus (staging only) an anchored pattern for Vercel preview URLs. Never `*`. */
export function originAllowed(origin: string | null, env: Pick<Env, 'ALLOWED_ORIGINS' | 'PREVIEW_ORIGIN_PATTERN'>): boolean {
  if (!origin) return false;
  const exact = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  if (exact.includes(origin)) return true;
  const pat = env.PREVIEW_ORIGIN_PATTERN.trim();
  if (!pat) return false;
  try {
    return new RegExp(`^(?:${pat.replace(/^\^/, '').replace(/\$$/, '')})$`).test(origin) && origin.startsWith('https://');
  } catch {
    return false;
  }
}

/** CORS headers for an allowed origin (credentials allowed only for allowlisted origins). */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

const BASE_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...extra } });
}

export const MAX_BODY = 8 * 1024;

/** Parse a JSON object body (at most MAX_BODY bytes). */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('Content-Length') ?? 0);
  if (len > MAX_BODY) throw new HttpError(413, 'too-large', 'Request too large.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'too-large', 'Request too large.');
  let v: unknown;
  try {
    v = JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'bad-json', 'Bad request.');
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'bad-json', 'Bad request.');
  return v as Record<string, unknown>;
}

export function str(body: Record<string, unknown>, key: string, max: number): string {
  const v = body[key];
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'bad-field', `Bad ${key}.`);
  return v;
}

export function bearer(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('Authorization') ?? '');
  return m ? m[1]! : null;
}

export const clientIp = (req: Request) => req.headers.get('CF-Connecting-IP') ?? 'local';
