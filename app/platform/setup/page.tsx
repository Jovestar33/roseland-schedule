import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readPlatformAuthSetupConfig } from '@/lib/platform/auth-setup';
import AuthSetupClient from './AuthSetupClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Development account setup',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PlatformAuthSetupPage() {
  const config = readPlatformAuthSetupConfig({
    SUPABASE_AUTH_SETUP_ENABLED: process.env.SUPABASE_AUTH_SETUP_ENABLED,
    SUPABASE_AUTH_SETUP_PROJECT_REF: process.env.SUPABASE_AUTH_SETUP_PROJECT_REF,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  });
  if (!config) notFound();

  return (
    <AuthSetupClient
      supabaseUrl={config.supabaseUrl}
      publishableKey={config.publishableKey}
      projectRef={config.projectRef}
    />
  );
}
