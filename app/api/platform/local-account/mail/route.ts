import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { readLocalWorkspaceConfig } from '@/lib/platform/local-workspace-config';
import { FICTIONAL_PRIVACY, FICTIONAL_TERMS } from '@/lib/platform/account-session';
export const dynamic = 'force-dynamic';
const generic = { message: 'If this request is eligible, check your email. You may also sign in with an existing account.' };
export async function POST(request: NextRequest) {
  const config = readLocalWorkspaceConfig(process.env, request.headers.get('host'));
  const secret = process.env.ROSELAND_LOCAL_ACCOUNT_SERVICE_KEY;
  if (!config || process.env.ROSELAND_LOCAL_ACCOUNTS !== 'supabase' || !secret) return new NextResponse(null, { status: 404 });
  try { const c=JSON.parse(Buffer.from(secret.split('.')[1],'base64url').toString()); if(c.role!=='service_role'||!['supabase','supabase-demo'].includes(c.iss))return new NextResponse(null,{status:404}); } catch { return new NextResponse(null,{status:404}); }
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const origin = `http://${request.headers.get('host')}`;
  if (request.headers.get('origin') !== origin || !request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ message: 'Request unavailable' }, { status: 403, headers });
  }
  // Never accept an IP supplied through arbitrary forwarding headers. This is
  // a loopback-only rehearsal: all callers share the local IP rate bucket.
  const ipHash = createHash('sha256').update('b08-loopback').digest('hex');
  const began = Date.now();
  try {
    const reader=request.body?.getReader();let raw='';const decoder=new TextDecoder();let size=0;
    if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2048){await reader.cancel();return NextResponse.json({message:'Request unavailable'},{status:413,headers});}raw+=decoder.decode(part.value,{stream:true});}
    raw+=decoder.decode();
    if (Buffer.byteLength(raw) > 2048) return NextResponse.json({ message: 'Request unavailable' }, { status: 413, headers });
    const body = JSON.parse(raw);
    if (!body || typeof body.email !== 'string' || body.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
      || !['signup', 'recovery'].includes(body.action) || Object.keys(body).some(key => !['action','email','invitationId','accepted'].includes(key))) {
      return NextResponse.json({ message: 'Check the request details' }, { status: 400, headers });
    }
    const invitation = typeof body.invitationId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.invitationId) ? body.invitationId : null;
    const client = createClient(config.supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' }) } });
    const settings=await fetch(`${config.supabaseUrl}/auth/v1/settings`,{headers:{apikey:config.anonymousKey},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    const authSettings=await settings.json();
    if(!settings.ok||authSettings.disable_signup!==true||authSettings.mailer_autoconfirm!==false)throw new Error('Local account configuration required');
    const policies = await client.rpc('get_local_account_policy_configuration');
    if (policies.error || policies.data?.enabled !== true) throw new Error('Account policy enforcement required');
    if (body.action === 'signup' && (policies.data.termsVersion !== FICTIONAL_TERMS || policies.data.privacyVersion !== FICTIONAL_PRIVACY)) {
      return NextResponse.json({ message: 'These fictional signup notices need updating. No signup was requested. Use an existing account or retry after the local notices are updated.' }, { status: 409, headers });
    }
    const admission = await client.rpc('admit_local_account_mail', { action: body.action, email: body.email, invitation_id: invitation, ip_hash: ipHash });
    if (admission.error) throw new Error('Unavailable');
    if (admission.data?.allowed) {
      if (body.action === 'signup' && body.accepted === true && invitation
        && admission.data.termsVersion === FICTIONAL_TERMS && admission.data.privacyVersion === FICTIONAL_PRIVACY) {
        // Public provider signup is disabled in the B08 stack. A pending app
        // invitation is necessary; this Auth invite creates no tenant membership.
        const result = await client.auth.admin.inviteUserByEmail(body.email, {
          redirectTo: `${origin}/local-workspace`, data: { b08_invitation: invitation },
        });
        if (!result.error && result.data.user) {
          await client.auth.admin.updateUserById(result.data.user.id, { app_metadata: {
            b08_terms: FICTIONAL_TERMS, b08_privacy: FICTIONAL_PRIVACY,
          } });
        }
      } else if (body.action === 'recovery') {
        const anon = createClient(config.supabaseUrl, config.anonymousKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await anon.auth.resetPasswordForEmail(body.email, { redirectTo: `${origin}/local-workspace` });
      }
    }
    // A common lower bound removes the obvious fast ineligible-user path. This
    // is not a claim of constant-time network/provider behavior.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 800 - (Date.now() - began))));
    return NextResponse.json(generic, { status: 202, headers });
  } catch {
    return NextResponse.json({ message: 'Request outcome is uncertain. Check your email or try signing in before requesting another message.' }, { status: 503, headers });
  }
}
