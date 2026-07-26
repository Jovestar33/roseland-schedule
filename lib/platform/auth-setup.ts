export type PlatformAuthSetupConfig = {
  supabaseUrl: string;
  publishableKey: string;
  projectRef: string;
};

type AuthSetupEnvironment = {
  SUPABASE_AUTH_SETUP_ENABLED?: string;
  SUPABASE_AUTH_SETUP_PROJECT_REF?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

export class PlatformAuthSetupConfigurationError extends Error {
  constructor() {
    super('The development Auth setup page is not configured safely.');
    this.name = 'PlatformAuthSetupConfigurationError';
  }
}

function fail(): never {
  throw new PlatformAuthSetupConfigurationError();
}

/**
 * Reads the development-only browser Auth configuration. The function fails
 * closed and deliberately never accepts a Supabase secret/service-role key.
 */
export function readPlatformAuthSetupConfig(
  environment: AuthSetupEnvironment,
): PlatformAuthSetupConfig | null {
  if (environment.SUPABASE_AUTH_SETUP_ENABLED !== 'true') {
    return null;
  }

  const projectRef = environment.SUPABASE_AUTH_SETUP_PROJECT_REF?.trim();
  const rawUrl = environment.SUPABASE_URL?.trim();
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) fail();
  if (!rawUrl || !publishableKey) fail();
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey)) fail();

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail();
  }

  if (
    url.protocol !== 'https:'
    || url.hostname !== `${projectRef}.supabase.co`
    || url.username
    || url.password
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search
    || url.hash
  ) {
    fail();
  }

  return {
    supabaseUrl: url.origin,
    publishableKey,
    projectRef,
  };
}
