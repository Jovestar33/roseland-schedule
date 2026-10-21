import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { readHostedWorkspaceConfig } from '@/lib/platform/hosted-workspace-config';
export const dynamic = 'force-dynamic';
const generic = { message: 'If this request is eligible, check your email. You may also sign in with an existing account.' };
export async function POST(request: NextRequest) {
  const config = readHostedWorkspaceConfig(process.env, request.headers.get('host'));
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || process.env.ROSELAND_HOSTED_ACCOUNT_MAIL !== 'supabase' || !secret) return new NextResponse(null, { status: 404 });
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const origin = config.appOrigin;
  if (request.headers.get('origin') !== origin || !request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ message: 'Request unavailable' }, { status: 403, headers });
  }
  // One database-backed deployment-wide bucket; untrusted forwarding headers cannot evade it.
  const ipHash = createHash('sha256').update('hosted-account-mail:' + config.appOrigin).digest('hex');
  const began = Date.now();
  try {
    const reader=request.body?.getReader();let raw='';const decoder=new TextDecoder();let size=0;
    if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2048){await reader.cancel();return NextResponse.json({message:'Request unavailable'},{status:413,headers});}raw+=decoder.decode(part.value,{stream:true});}
    raw+=decoder.decode();
    if (Buffer.byteLength(raw) > 2048) return NextResponse.json({ message: 'Request unavailable' }, { status: 413, headers });
    const body = JSON.parse(raw);
    if (!body || typeof body.email !== 'string' || body.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
      || !['signup', 'recovery'].includes(body.action) || Object.keys(body).some(key => !['action','email','invitationId'].includes(key))) {
      return NextResponse.json({ message: 'Check the request details' }, { status: 400, headers });
    }
    const invitation = typeof body.invitationId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.invitationId) ? body.invitationId : null;
    const client = createClient(config.supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' }) } });
    const settings=await fetch(`${config.supabaseUrl}/auth/v1/settings`,{headers:{apikey:config.anonymousKey},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    const authSettings=await settings.json();
    if(!settings.ok||authSettings.disable_signup!==true||authSettings.mailer_autoconfirm!==false)throw new Error('Hosted account configuration required');
    const policies = await client.rpc('get_local_account_policy_configuration');
    // Internal staff trial: preserve the existing disabled policy gate. Real public
    // signup notices require a separate approved rollout, never fictional acceptance.
    if (policies.error || policies.data?.enabled !== false) throw new Error('Hosted account notices unavailable');
    const admission = await client.rpc('admit_local_account_mail', { action: body.action, email: body.email, invitation_id: invitation, ip_hash: ipHash });
    if (admission.error) throw new Error('Unavailable');
    if (admission.data?.allowed) {
      if (body.action === 'signup' && invitation) {
        const result = await client.auth.admin.inviteUserByEmail(body.email, {
          redirectTo: `${origin}/workspace`, data: { b08_invitation: invitation },
        });
        if (result.error) throw new Error('Invitation email outcome unavailable');
      } else if (body.action === 'recovery') {
        const anon = createClient(config.supabaseUrl, config.anonymousKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const result = await anon.auth.resetPasswordForEmail(body.email, { redirectTo: `${origin}/workspace` });
        if (result.error) throw new Error('Recovery email outcome unavailable');
      }
    }
    // A common lower bound removes the obvious fast ineligible-user path. This
    // is not a claim of constant-time network/provider behavior.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 800 - (Date.now() - began))));
    return NextResponse.json(generic, { status: 202, headers });
  } catch {
    return NextResponse.json({ message: 'Please check your inbox. If no email arrives, try again in a few minutes.' }, { status: 503, headers });
  }
}
