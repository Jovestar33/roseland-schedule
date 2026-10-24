import {NextRequest} from 'next/server';
import {readCallSheet} from '@/lib/platform/call-sheet-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest){return readCallSheet(request);}
