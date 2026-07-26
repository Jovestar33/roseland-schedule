import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../../', import.meta.url);

test('Google Places credentials stay server-only', async () => {
  const [route, legacyClient, envExample] = await Promise.all([
    readFile(new URL('app/api/places/route.ts', repositoryRoot), 'utf8'),
    readFile(new URL('index.html', repositoryRoot), 'utf8'),
    readFile(new URL('.env.example', repositoryRoot), 'utf8'),
  ]);
  const providerKeyPrefix = `AI${'za'}`;

  assert.equal(route.includes(providerKeyPrefix), false);
  assert.equal(legacyClient.includes(providerKeyPrefix), false);
  assert.equal(route.includes('NEXT_PUBLIC_GOOGLE_PLACES_KEY'), false);
  assert.equal(envExample.includes('NEXT_PUBLIC_GOOGLE_PLACES_KEY'), false);
  assert.match(route, /process\.env\.GOOGLE_PLACES_KEY/);
  assert.match(legacyClient, /fetch\('\/api\/places'/);
});
