import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  parseIdempotencyKey,
  parseVerifiedJwtClaims,
  PlatformInputError,
  type VerifiedJwtClaims,
} from './contracts';

const MAX_BODY_BYTES = 16 * 1024;

type PlatformConfig = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

type SupabaseUser = {
  id?: unknown;
  email_confirmed_at?: unknown;
  is_anonymous?: unknown;
};

export class PlatformHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PlatformHttpError';
    this.status = status;
  }
}

export function assertPlatformWorkflowsEnabled(): void {
  if (process.env.SUPABASE_PLATFORM_WORKFLOWS_ENABLED !== 'true') {
    throw new PlatformHttpError(404, 'Not found');
  }
}

function platformConfig(): PlatformConfig {
  assertPlatformWorkflowsEnabled();

  const rawUrl = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();

  if (!rawUrl || !publishableKey || !secretKey) {
    throw new PlatformHttpError(503, 'Workflow unavailable');
  }
  if (secretKey === publishableKey || secretKey.startsWith('sb_publishable_')) {
    throw new PlatformHttpError(503, 'Workflow unavailable');
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PlatformHttpError(503, 'Workflow unavailable');
  }

  const isLoopback = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new PlatformHttpError(503, 'Workflow unavailable');
  }

  return {
    url: url.origin,
    publishableKey,
    secretKey,
  };
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) throw new PlatformHttpError(401, 'Authentication required');
  return match[1];
}

function assertAllowedOrigin(request: NextRequest): void {
  const origin = request.headers.get('origin');
  if (!origin) return;

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    throw new PlatformHttpError(403, 'Request unavailable');
  }

  if (normalizedOrigin !== request.nextUrl.origin) {
    throw new PlatformHttpError(403, 'Request unavailable');
  }
}

export async function readPlatformJson(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || '';
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new PlatformHttpError(415, 'JSON request required');
  }
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new PlatformHttpError(413, 'Request too large');
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw new PlatformHttpError(413, 'Request too large');
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new PlatformHttpError(400, 'Invalid request');
  }
}

export function workflowRequestId(request: NextRequest): string {
  try {
    return parseIdempotencyKey(request.headers.get('idempotency-key'));
  } catch (error) {
    if (error instanceof PlatformInputError) {
      throw new PlatformHttpError(400, error.message);
    }
    throw error;
  }
}

export async function authenticatePlatformRequest(
  request: NextRequest,
  maximumAuthenticationAgeSeconds: number,
): Promise<{ actor: VerifiedJwtClaims; config: PlatformConfig }> {
  const config = platformConfig();
  assertAllowedOrigin(request);
  const accessToken = bearerToken(request);

  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.publishableKey,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PlatformHttpError(503, 'Authentication unavailable');
  }

  if (!response.ok) throw new PlatformHttpError(401, 'Authentication required');

  let user: SupabaseUser;
  try {
    user = await response.json() as SupabaseUser;
  } catch {
    throw new PlatformHttpError(503, 'Authentication unavailable');
  }

  if (
    typeof user.id !== 'string'
    || typeof user.email_confirmed_at !== 'string'
    || user.is_anonymous === true
  ) {
    throw new PlatformHttpError(403, 'Verified account required');
  }

  try {
    const actor = parseVerifiedJwtClaims(
      accessToken,
      user.id,
      `${config.url}/auth/v1`,
      Math.floor(Date.now() / 1000),
      maximumAuthenticationAgeSeconds,
    );
    return { actor, config };
  } catch (error) {
    if (error instanceof PlatformInputError) {
      throw new PlatformHttpError(403, error.message);
    }
    throw error;
  }
}

export async function callPlatformRpc(
  config: PlatformConfig,
  functionName: string,
  payload: Record<string, unknown>,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: config.secretKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PlatformHttpError(503, 'Workflow unavailable');
  }

  if (!response.ok) {
    let providerMessage = '';
    try {
      const body = await response.json() as { message?: unknown };
      providerMessage = typeof body.message === 'string' ? body.message : '';
    } catch {
      providerMessage = '';
    }

    if (providerMessage === 'workflow rate limit exceeded') {
      throw new PlatformHttpError(429, 'Please try again later');
    }
    if (
      providerMessage === 'organization workflow unavailable'
      || providerMessage === 'invitation workflow unavailable'
    ) {
      throw new PlatformHttpError(403, 'Workflow unavailable');
    }
    throw new PlatformHttpError(502, 'Workflow unavailable');
  }

  let resourceId: unknown;
  try {
    resourceId = await response.json();
  } catch {
    throw new PlatformHttpError(502, 'Workflow unavailable');
  }
  if (typeof resourceId !== 'string') throw new PlatformHttpError(502, 'Workflow unavailable');
  return resourceId;
}

export function platformJson(
  body: Record<string, unknown>,
  status: number,
  requestId: string,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-request-id': requestId,
    },
  });
}

export function platformError(error: unknown, requestId: string = randomUUID()): NextResponse {
  if (error instanceof PlatformHttpError) {
    return platformJson({ error: error.message, requestId }, error.status, requestId);
  }
  if (error instanceof PlatformInputError) {
    return platformJson({ error: error.message, requestId }, 400, requestId);
  }
  return platformJson({ error: 'Workflow unavailable', requestId }, 500, requestId);
}
