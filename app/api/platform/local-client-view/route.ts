import {NextRequest} from 'next/server';
import {exchangeClientRecipient} from '@/lib/platform/client-recipient-response';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest){return exchangeClientRecipient(request);}
