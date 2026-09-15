import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { readLocalAdminConfig } from '@/lib/platform/local-admin-config';
import LocalInvitationsClient from './LocalInvitationsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Local invitations', robots: { index: false, follow: false } };
export default async function LocalInvitationsPage() {
  const config = readLocalAdminConfig(process.env, (await headers()).get('host'));
  if (!config) notFound();
  return <LocalInvitationsClient config={config} />;
}
