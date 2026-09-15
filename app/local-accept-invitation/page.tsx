import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { readLocalAcceptanceConfig } from '@/lib/platform/local-acceptance-config';
import LocalAcceptanceClient from './LocalAcceptanceClient';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accept a local invitation', robots: { index: false, follow: false } };
export default async function LocalAcceptancePage() {
  const config = readLocalAcceptanceConfig(process.env, (await headers()).get('host'));
  if (!config) notFound();
  return <LocalAcceptanceClient config={config} />;
}
