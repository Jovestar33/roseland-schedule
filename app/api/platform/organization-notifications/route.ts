import type {NextRequest} from 'next/server';
import {postHostedNotification} from '@/lib/platform/hosted-notifications';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:NextRequest){return postHostedNotification(request,'organization');}
