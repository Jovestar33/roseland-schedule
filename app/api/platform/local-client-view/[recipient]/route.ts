import {NextRequest} from 'next/server';
import {readClientRecipient} from '@/lib/platform/client-recipient-response';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest,{params}:{params:Promise<{recipient:string}>}){return readClientRecipient(request,(await params).recipient);}
