import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCreateInvitationInput,
  parseIdempotencyKey,
  parseProvisionOrganizationInput,
  parseRevokeInvitationInput,
  parseVerifiedJwtClaims,
  PlatformInputError,
} from '../../lib/platform/contracts.ts';

const NOW = 2_000_000_000;
const USER_ID = '61000000-0000-4000-a000-000000000001';
const ORGANIZATION_ID = '62000000-0000-4000-a000-000000000001';
const PRODUCTION_ID = '63000000-0000-4000-a000-000000000001';
const ISSUER = 'https://example.supabase.co/auth/v1';

function token(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.verified-by-auth-server`;
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: USER_ID,
    iss: ISSUER,
    aud: 'authenticated',
    role: 'authenticated',
    aal: 'aal2',
    exp: NOW + 3600,
    iat: NOW - 60,
    is_anonymous: false,
    amr: [
      { method: 'password', timestamp: NOW - 120 },
      { method: 'totp', timestamp: NOW - 30 },
      { method: 'token_refresh', timestamp: NOW - 1 },
    ],
    ...overrides,
  };
}

test('provisioning input normalizes global organization preferences', () => {
  assert.deepEqual(parseProvisionOrganizationInput({
    ownerUserId: USER_ID.toUpperCase(),
    name: '  Customer Studio  ',
    slug: 'Customer-Studio',
    timezone: 'Asia/Dubai',
    locale: 'en-ae',
    countryCode: 'ae',
    currency: 'aed',
    reason: '  Approved pilot  ',
  }), {
    ownerUserId: USER_ID,
    name: 'Customer Studio',
    slug: 'customer-studio',
    timezone: 'Asia/Dubai',
    locale: 'en-AE',
    countryCode: 'AE',
    currency: 'AED',
    reason: 'Approved pilot',
  });
});

test('provisioning rejects invalid slugs and timezones', () => {
  assert.throws(() => parseProvisionOrganizationInput({
    ownerUserId: USER_ID,
    name: 'Customer',
    slug: 'customer studio',
    timezone: 'Not/A_Timezone',
    reason: 'Pilot',
  }), PlatformInputError);
});

test('invitation input defaults to a seven-day member invitation', () => {
  assert.deepEqual(parseCreateInvitationInput({
    organizationId: ORGANIZATION_ID,
    email: ' Person@Example.Test ',
  }), {
    organizationId: ORGANIZATION_ID,
    email: 'person@example.test',
    organizationRole: 'member',
    productionId: null,
    productionRole: null,
    expiresInDays: 7,
  });
});

test('production invitations require a paired production role', () => {
  assert.throws(() => parseCreateInvitationInput({
    organizationId: ORGANIZATION_ID,
    email: 'person@example.test',
    productionId: PRODUCTION_ID,
  }), PlatformInputError);
});

test('production invitations accept bounded roles and expiry', () => {
  assert.equal(parseCreateInvitationInput({
    organizationId: ORGANIZATION_ID,
    email: 'person@example.test',
    productionId: PRODUCTION_ID,
    productionRole: 'editor',
    expiresInDays: 30,
  }).productionRole, 'editor');

  assert.throws(() => parseCreateInvitationInput({
    organizationId: ORGANIZATION_ID,
    email: 'person@example.test',
    productionId: PRODUCTION_ID,
    productionRole: 'owner',
  }), PlatformInputError);
});

test('revocation requires a bounded reason', () => {
  assert.deepEqual(parseRevokeInvitationInput({ reason: '  Access no longer required  ' }), {
    reason: 'Access no longer required',
  });
  assert.throws(() => parseRevokeInvitationInput({ reason: ' ' }), PlatformInputError);
});

test('idempotency keys are mandatory and log-safe', () => {
  assert.equal(parseIdempotencyKey(' invite-0001 '), 'invite-0001');
  assert.throws(() => parseIdempotencyKey(null), PlatformInputError);
  assert.throws(() => parseIdempotencyKey('unsafe key/value'), PlatformInputError);
});

test('verified AAL2 claims use the recent authentication method, not token refresh', () => {
  assert.deepEqual(parseVerifiedJwtClaims(
    token(claims()),
    USER_ID,
    ISSUER,
    NOW,
    15 * 60,
  ), {
    userId: USER_ID,
    aal: 'aal2',
    authenticatedAt: new Date((NOW - 30) * 1000).toISOString(),
  });
});

test('AAL1 sessions are rejected', () => {
  assert.throws(() => parseVerifiedJwtClaims(
    token(claims({ aal: 'aal1' })),
    USER_ID,
    ISSUER,
    NOW,
    15 * 60,
  ), PlatformInputError);
});

test('stale authentication is rejected even when a token was recently refreshed', () => {
  assert.throws(() => parseVerifiedJwtClaims(
    token(claims({
      amr: [
        { method: 'totp', timestamp: NOW - 901 },
        { method: 'token_refresh', timestamp: NOW - 1 },
      ],
    })),
    USER_ID,
    ISSUER,
    NOW,
    15 * 60,
  ), PlatformInputError);
});

test('claim subject and issuer must match the verified Auth response', () => {
  assert.throws(() => parseVerifiedJwtClaims(
    token(claims({ sub: '61000000-0000-4000-a000-000000000002' })),
    USER_ID,
    ISSUER,
    NOW,
    15 * 60,
  ), PlatformInputError);
  assert.throws(() => parseVerifiedJwtClaims(
    token(claims({ iss: 'https://attacker.example/auth/v1' })),
    USER_ID,
    ISSUER,
    NOW,
    15 * 60,
  ), PlatformInputError);
});
