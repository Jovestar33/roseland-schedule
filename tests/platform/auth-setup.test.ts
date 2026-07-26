import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PlatformAuthSetupConfigurationError,
  readPlatformAuthSetupConfig,
} from '../../lib/platform/auth-setup.ts';

const PROJECT_REF = 'abcdefghijklmnopqrst';
const PUBLISHABLE_KEY = `sb_publishable_${'a'.repeat(32)}`;

test('development Auth setup is disabled by default', () => {
  assert.equal(readPlatformAuthSetupConfig({}), null);
  assert.equal(readPlatformAuthSetupConfig({
    SUPABASE_AUTH_SETUP_ENABLED: 'false',
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
  }), null);
});

test('development Auth setup accepts only a matching hosted Supabase project', () => {
  assert.deepEqual(readPlatformAuthSetupConfig({
    SUPABASE_AUTH_SETUP_ENABLED: 'true',
    SUPABASE_AUTH_SETUP_PROJECT_REF: PROJECT_REF,
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co/`,
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
  }), {
    supabaseUrl: `https://${PROJECT_REF}.supabase.co`,
    publishableKey: PUBLISHABLE_KEY,
    projectRef: PROJECT_REF,
  });
});

test('development Auth setup rejects secret keys and mismatched projects', () => {
  assert.throws(() => readPlatformAuthSetupConfig({
    SUPABASE_AUTH_SETUP_ENABLED: 'true',
    SUPABASE_AUTH_SETUP_PROJECT_REF: PROJECT_REF,
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: `sb_secret_${'a'.repeat(32)}`,
  }), PlatformAuthSetupConfigurationError);

  assert.throws(() => readPlatformAuthSetupConfig({
    SUPABASE_AUTH_SETUP_ENABLED: 'true',
    SUPABASE_AUTH_SETUP_PROJECT_REF: PROJECT_REF,
    SUPABASE_URL: 'https://zyxwvutsrqponmlkjihg.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
  }), PlatformAuthSetupConfigurationError);
});

test('development Auth setup rejects insecure or malformed URLs', () => {
  for (const url of [
    `http://${PROJECT_REF}.supabase.co`,
    `https://${PROJECT_REF}.supabase.co/rest/v1`,
    `https://${PROJECT_REF}.supabase.co?key=value`,
  ]) {
    assert.throws(() => readPlatformAuthSetupConfig({
      SUPABASE_AUTH_SETUP_ENABLED: 'true',
      SUPABASE_AUTH_SETUP_PROJECT_REF: PROJECT_REF,
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    }), PlatformAuthSetupConfigurationError);
  }
});
