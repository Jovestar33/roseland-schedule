const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { sourceLoader } = require('../editor/source-loader.cjs');
const server = sourceLoader({ 'server-only': {}, 'next/server': {} })('lib/platform/server.ts');
const userId = '61000000-0000-4000-a000-000000000001';
const sessionId = '61000000-0000-4000-a000-000000000099';
const names = ['SUPABASE_PLATFORM_WORKFLOWS_ENABLED', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'];
let savedEnv, savedFetch;
beforeEach(() => {
  savedEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  savedFetch = global.fetch;
  Object.assign(process.env, {
    SUPABASE_PLATFORM_WORKFLOWS_ENABLED: 'true', SUPABASE_URL: 'http://127.0.0.1:58321',
    SUPABASE_PUBLISHABLE_KEY: 'fictional-public', SUPABASE_SECRET_KEY: 'fictional-service',
  });
});
afterEach(() => {
  global.fetch = savedFetch;
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
function request() {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: userId, session_id: sessionId, iss: 'http://127.0.0.1:58321/auth/v1',
    aud: 'authenticated', role: 'authenticated', aal: 'aal2', exp: now + 3600,
    amr: [{ method: 'totp', timestamp: now - 10 }] };
  const token = 'unit.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.not-a-real-signature';
  return { headers: new Headers({ authorization: 'Bearer ' + token, 'x-actor-session-id': 'untrusted-input' }),
    nextUrl: new URL('http://127.0.0.1:3000/api/platform/invitations') };
}
const userReply = () => Response.json({ id: userId, email_confirmed_at: '2026-09-15T00:00:00Z', is_anonymous: false });
const isError = status => error => error instanceof server.PlatformHttpError && error.status === status;

test('verified Auth claims bind service workflow headers; inbound actor headers are ignored', async () => {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? userReply() : Response.json('resource-id');
  };
  const { actor, config } = await server.authenticatePlatformRequest(request(), 900);
  assert.equal(await server.callPlatformRpc(config, 'create_organization_invitation', { p_actor_user_id: actor.userId }), 'resource-id');
  assert.equal(calls[0].url, 'http://127.0.0.1:58321/auth/v1/user');
  assert.equal(calls[0].init.headers.apikey, 'fictional-public');
  assert.deepEqual(calls[1].init.headers, {
    apikey: 'fictional-service', 'content-type': 'application/json',
    'x-actor-user-id': userId, 'x-actor-session-id': sessionId, 'x-actor-session-exp': String(actor.expiresAt),
  });
  assert.equal(calls[1].init.cache, 'no-store');
});

test('failed Auth verification never reaches a service-role RPC', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return new Response(null, { status: 401 }); };
  await assert.rejects(server.authenticatePlatformRequest(request(), 900), isError(401));
  assert.equal(calls, 1);
});

test('legacy JWT service keys get a bearer header; new secret keys never do', async () => {
  for (const serviceKey of ['fictional.jwt.signature', 'sb_secret_fictional']) {
    process.env.SUPABASE_SECRET_KEY = serviceKey;
    global.fetch = async () => userReply();
    const { config } = await server.authenticatePlatformRequest(request(), 900);
    global.fetch = async (_url, init) => {
      assert.equal(init.headers.apikey, serviceKey);
      assert.equal(init.headers.authorization, serviceKey.startsWith('sb_secret_') ? undefined : 'Bearer ' + serviceKey);
      return Response.json('resource-id');
    };
    await server.callPlatformRpc(config, 'create_organization_invitation', { p_actor_user_id: userId });
  }
});

test('unbound, mismatched and unapproved service requests are refused before transport', async () => {
  global.fetch = async () => userReply();
  const { config } = await server.authenticatePlatformRequest(request(), 900);
  global.fetch = async () => assert.fail('Refused request must not use service transport');
  await assert.rejects(server.callPlatformRpc({ ...config, actor: undefined }, 'create_organization_invitation', { p_actor_user_id: userId }), isError(403));
  await assert.rejects(server.callPlatformRpc(config, 'create_organization_invitation', { p_actor_user_id: sessionId }), isError(403));
  await assert.rejects(server.callPlatformRpc(config, 'bootstrap_first_organization', { p_actor_user_id: userId }), isError(403));
});

test('revocation between Auth verification and SQL admission returns a bounded 401', async () => {
  global.fetch = async () => userReply();
  const { config } = await server.authenticatePlatformRequest(request(), 900);
  global.fetch = async () => Response.json({ message: 'internal-provider-detail' }, { status: 401 });
  await assert.rejects(server.callPlatformRpc(config, 'revoke_organization_invitation', { p_actor_user_id: userId }),
    error => isError(401)(error) && error.message === 'Authentication required');
});

test('platform workflows stay disabled by default', async () => {
  delete process.env.SUPABASE_PLATFORM_WORKFLOWS_ENABLED;
  global.fetch = async () => assert.fail('Disabled workflows must not use Auth or service transport');
  await assert.rejects(server.authenticatePlatformRequest(request(), 900), isError(404));
});

test('workflow replay conflicts and rate caps have bounded, distinct responses', async () => {
  global.fetch = async () => userReply();
  const { config } = await server.authenticatePlatformRequest(request(), 900);
  global.fetch = async () => Response.json({ message: 'Internal request details' }, { status: 409 });
  await assert.rejects(server.callPlatformRpc(config, 'create_organization_invitation', { p_actor_user_id: userId }),
    error => isError(409)(error) && error.message === 'Request key conflict; review the original result before retrying');
  global.fetch = async () => Response.json({ message: 'workflow rate limit exceeded' }, { status: 400 });
  await assert.rejects(server.callPlatformRpc(config, 'create_organization_invitation', { p_actor_user_id: userId }),
    error => isError(429)(error) && error.message === 'Please try again later');
});

test('actual NextRequest loopback normalization preserves exact browser origin checks', async () => {
  const { NextRequest } = require('next/server');
  const bearer = request().headers.get('authorization');
  global.fetch = async () => userReply();
  const same = new NextRequest('http://127.0.0.1:3341/api/platform/invitations', {
    headers: { host: '127.0.0.1:3341', origin: 'http://127.0.0.1:3341', authorization: bearer },
  });
  assert.equal(same.nextUrl.hostname, 'localhost');
  await server.authenticatePlatformRequest(same, 900);
  global.fetch = async () => assert.fail('Wrong origin must fail before Auth');
  for (const origin of ['http://localhost:3341', 'http://127.0.0.1:3342', 'https://untrusted.example']) {
    const cross = new NextRequest('http://127.0.0.1:3341/api/platform/invitations', {
      headers: { host: '127.0.0.1:3341', origin, authorization: bearer },
    });
    await assert.rejects(server.authenticatePlatformRequest(cross, 900), isError(403));
  }
});
