import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { readLocalEditorConfig } from '@/lib/platform/local-editor-config';
import LocalScheduleClient from './LocalScheduleClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Local schedule rehearsal', robots: { index: false, follow: false } };
export default async function LocalSchedulePage() {
  const config = readLocalEditorConfig(process.env, (await headers()).get('host'));
  if (!config) notFound();
  return <LocalScheduleClient config={config} />;
}
