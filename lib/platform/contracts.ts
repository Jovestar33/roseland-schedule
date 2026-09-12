const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]+$/;

export class PlatformInputError extends Error {
  constructor(message = 'Invalid request') {
    super(message);
    this.name = 'PlatformInputError';
  }
}

type JsonObject = Record<string, unknown>;

export type ProvisionOrganizationInput = {
  ownerUserId: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  countryCode: string | null;
  currency: string | null;
  reason: string;
};

export type CreateInvitationInput = {
  organizationId: string;
  email: string;
  organizationRole: 'owner' | 'admin' | 'member';
  productionId: string | null;
  productionRole: 'editor' | 'viewer' | null;
  expiresInDays: number;
};

export type RevokeInvitationInput = {
  reason: string;
};

export type VerifiedJwtClaims = {
  userId: string;
  aal: 'aal2';
  authenticatedAt: string;
};

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlatformInputError();
  }
  return value as JsonObject;
}

function boundedString(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') throw new PlatformInputError();
  const normalized = value.trim();
  if (
    normalized.length < min
    || normalized.length > max
    || /[\u0000-\u001F\u007F]/.test(normalized)
  ) throw new PlatformInputError();
  return normalized;
}

function nullableCode(value: unknown, pattern: RegExp): string | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = boundedString(value, 2, 3).toUpperCase();
  if (!pattern.test(normalized)) throw new PlatformInputError();
  return normalized;
}

function uuid(value: unknown): string {
  const normalized = boundedString(value, 36, 36);
  if (!UUID_PATTERN.test(normalized)) throw new PlatformInputError();
  return normalized.toLowerCase();
}

function timezone(value: unknown): string {
  const normalized = boundedString(value, 1, 100);
  try {
    new Intl.DateTimeFormat('en', { timeZone: normalized }).format();
  } catch {
    throw new PlatformInputError();
  }
  return normalized;
}

function locale(value: unknown): string {
  const normalized = boundedString(value, 2, 35);
  try {
    return Intl.getCanonicalLocales(normalized)[0];
  } catch {
    throw new PlatformInputError();
  }
}

export function parseIdempotencyKey(value: string | null): string {
  if (!value) throw new PlatformInputError('An Idempotency-Key header is required');
  const normalized = value.trim();
  if (
    normalized.length < 8
    || normalized.length > 160
    || !REQUEST_ID_PATTERN.test(normalized)
  ) {
    throw new PlatformInputError('Invalid Idempotency-Key header');
  }
  return normalized;
}

export function parseProvisionOrganizationInput(value: unknown): ProvisionOrganizationInput {
  const input = asObject(value);
  const slug = boundedString(input.slug, 1, 120).toLowerCase();
  if (!SLUG_PATTERN.test(slug)) throw new PlatformInputError();

  return {
    ownerUserId: uuid(input.ownerUserId),
    name: boundedString(input.name, 1, 120),
    slug,
    timezone: timezone(input.timezone ?? 'UTC'),
    locale: locale(input.locale ?? 'en'),
    countryCode: nullableCode(input.countryCode, /^[A-Z]{2}$/),
    currency: nullableCode(input.currency, /^[A-Z]{3}$/),
    reason: boundedString(input.reason, 1, 500),
  };
}

export function parseCreateInvitationInput(value: unknown): CreateInvitationInput {
  const input = asObject(value);
  const email = boundedString(input.email, 3, 320).toLowerCase();
  if (!email.includes('@') || email.startsWith('@') || /\s/.test(email)) {
    throw new PlatformInputError();
  }

  const organizationRole = input.organizationRole ?? 'member';
  if (!['owner', 'admin', 'member'].includes(String(organizationRole))) {
    throw new PlatformInputError();
  }

  const productionId = input.productionId === null || input.productionId === undefined
    ? null
    : uuid(input.productionId);
  const productionRole = input.productionRole === null || input.productionRole === undefined
    ? null
    : String(input.productionRole);

  if ((productionId === null) !== (productionRole === null)) throw new PlatformInputError();
  if (productionRole !== null && !['editor', 'viewer'].includes(productionRole)) {
    throw new PlatformInputError();
  }

  const expiresInDays = input.expiresInDays ?? 7;
  if (!Number.isInteger(expiresInDays) || Number(expiresInDays) < 1 || Number(expiresInDays) > 30) {
    throw new PlatformInputError();
  }

  return {
    organizationId: uuid(input.organizationId),
    email,
    organizationRole: organizationRole as CreateInvitationInput['organizationRole'],
    productionId,
    productionRole: productionRole as CreateInvitationInput['productionRole'],
    expiresInDays: Number(expiresInDays),
  };
}

export function parseRevokeInvitationInput(value: unknown): RevokeInvitationInput {
  const input = asObject(value);
  return { reason: boundedString(input.reason, 1, 500) };
}

export function parseInvitationId(value: unknown): string {
  return uuid(value);
}

function decodeJwtPayload(accessToken: string): JsonObject {
  if (accessToken.length > 8192) throw new PlatformInputError('Invalid access token');
  const parts = accessToken.split('.');
  if (parts.length !== 3) throw new PlatformInputError('Invalid access token');

  try {
    return asObject(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
  } catch {
    throw new PlatformInputError('Invalid access token');
  }
}

export function parseVerifiedJwtClaims(
  accessToken: string,
  verifiedUserId: string,
  expectedIssuer: string,
  nowSeconds: number,
  maximumAuthenticationAgeSeconds: number,
): VerifiedJwtClaims {
  const claims = decodeJwtPayload(accessToken);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const expiresAt = Number(claims.exp);
  const notBefore = claims.nbf === undefined ? null : Number(claims.nbf);

  if (
    claims.sub !== verifiedUserId
    || claims.iss !== expectedIssuer
    || claims.role !== 'authenticated'
    || !audience.includes('authenticated')
    || claims.aal !== 'aal2'
    || claims.is_anonymous === true
    || !Number.isFinite(expiresAt)
    || expiresAt <= nowSeconds
    || (notBefore !== null && (!Number.isFinite(notBefore) || notBefore > nowSeconds + 60))
  ) {
    throw new PlatformInputError('Stronger authentication is required');
  }

  if (!Array.isArray(claims.amr)) {
    throw new PlatformInputError('Recent authentication is required');
  }

  const authenticationTimes = claims.amr
    .filter((entry): entry is JsonObject => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
    .filter((entry) => entry.method !== 'token_refresh')
    .map((entry) => Number(entry.timestamp))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp <= nowSeconds + 60);
  const authenticatedAtSeconds = Math.max(...authenticationTimes);

  if (
    !Number.isFinite(authenticatedAtSeconds)
    || authenticatedAtSeconds < nowSeconds - maximumAuthenticationAgeSeconds
  ) {
    throw new PlatformInputError('Recent authentication is required');
  }

  return {
    userId: verifiedUserId,
    aal: 'aal2',
    authenticatedAt: new Date(authenticatedAtSeconds * 1000).toISOString(),
  };
}
