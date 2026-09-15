import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { parseInvitationId } from './contracts.ts';
import { InvitationError, type InvitationAttempt, type CheckedResult } from './invitation-controller.ts';

export interface OrganizationChoice { id: string; name: string; role: 'owner' | 'admin' }
export interface ProductionChoice { id: string; name: string }
export interface PendingInvitation { id: string; email: string; role: 'owner' | 'admin' | 'member'; productionId: string | null; productionRole: string | null; expiresAt: string }
export interface Page<T> { items: T[]; more: boolean }
const PAGE_SIZE = 25;
function page<T>(items: T[]): Page<T> { return { items: items.slice(0, PAGE_SIZE), more: items.length > PAGE_SIZE }; }
function failure(error: { code?: string } | null, status: number) {
  if (error) throw new InvitationError(status === 401 ? 'auth' : status === 403 ? 'denied' : 'unknown');
}
function boundedName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 320) throw new InvitationError('unknown');
  return value;
}
export function createInvitationRepository(client: SupabaseClient) {
  return {
    async organizations(actor: string, after?: string): Promise<Page<OrganizationChoice>> {
      let query = client.from('organization_memberships').select('organization_id,role,organizations!inner(name,deleted_at)')
        .eq('user_id', parseInvitationId(actor)).eq('status', 'active').in('role', ['owner', 'admin'])
        .is('organizations.deleted_at', null).order('organization_id').limit(PAGE_SIZE + 1);
      if (after) query = query.gt('organization_id', parseInvitationId(after));
      const response = await query; failure(response.error, response.status);
      return page((response.data ?? []).map(row => {
        const org = row.organizations as unknown as { name: unknown };
        if (row.role !== 'owner' && row.role !== 'admin') throw new InvitationError('unknown');
        return { id: parseInvitationId(row.organization_id), name: boundedName(org.name), role: row.role };
      }));
    },
    async productions(organization: string, after?: string): Promise<Page<ProductionChoice>> {
      let query = client.from('productions').select('id,name').eq('organization_id', parseInvitationId(organization))
        .is('deleted_at', null).order('id').limit(PAGE_SIZE + 1);
      if (after) query = query.gt('id', parseInvitationId(after));
      const response = await query; failure(response.error, response.status);
      return page((response.data ?? []).map(row => ({ id: parseInvitationId(row.id), name: boundedName(row.name) })));
    },
    async pending(organization: string, after?: string): Promise<Page<PendingInvitation>> {
      let query = client.from('organization_invitations').select('id,email,organization_role,production_id,production_role,expires_at')
        .eq('organization_id', parseInvitationId(organization)).eq('status', 'pending').order('id').limit(PAGE_SIZE + 1);
      if (after) query = query.gt('id', parseInvitationId(after));
      const response = await query; failure(response.error, response.status);
      return page((response.data ?? []).map(row => {
        if (!['owner', 'admin', 'member'].includes(row.organization_role) || !Number.isFinite(Date.parse(row.expires_at))) throw new InvitationError('unknown');
        return { id: parseInvitationId(row.id), email: boundedName(row.email), role: row.organization_role,
          productionId: row.production_id ? parseInvitationId(row.production_id) : null, productionRole: row.production_role, expiresAt: row.expires_at };
      }));
    },
    async result(attempt: InvitationAttempt): Promise<CheckedResult | null> {
      const event = await client.from('audit_events').select('resource_id,metadata').eq('organization_id', attempt.organization)
        .eq('actor_user_id', attempt.actor).eq('request_id', attempt.key)
        .eq('action', attempt.kind === 'create' ? 'organization.invitation.created' : 'organization.invitation.revoked').limit(2);
      failure(event.error, event.status);
      if (!event.data?.length) return null;
      if (event.data.length !== 1) throw new InvitationError('unknown');
      const id = parseInvitationId(event.data[0].resource_id);
      const response = await client.from('organization_invitations').select('email_normalized,organization_role,production_id,production_role,created_at,expires_at,status')
        .eq('organization_id', attempt.organization).eq('id', id).maybeSingle();
      failure(response.error, response.status);
      if (!response.data) return null;
      const item = response.data;
      const matches = attempt.kind === 'revoke'
        ? id === attempt.target && event.data[0].metadata?.reason === attempt.body.reason && item.status === 'revoked'
        : item.email_normalized === attempt.body.email && item.organization_role === attempt.body.organizationRole
          && item.production_id === attempt.body.productionId && item.production_role === attempt.body.productionRole
          && Date.parse(item.expires_at) - Date.parse(item.created_at) === Number(attempt.body.expiresInDays) * 86400000;
      return { id, matches, description: `${item.email_normalized} · ${item.organization_role} · ${item.status}` };
    },
  };
}

export async function sendInvitationAttempt(attempt: InvitationAttempt, session: Session | null, request: typeof fetch = fetch): Promise<string> {
  if (!session || session.user.id !== attempt.actor) throw new InvitationError('auth');
  let response: Response;
  try {
    response = await request(attempt.kind === 'create' ? '/api/platform/invitations' : `/api/platform/invitations/${attempt.target}/revoke`, {
      method: 'POST', headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', 'idempotency-key': attempt.key },
      body: JSON.stringify(attempt.body), redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
  } catch { throw new InvitationError('unknown'); }
  let body: { invitationId?: unknown; error?: unknown };
  try { body = await response.json(); } catch { throw new InvitationError('unknown'); }
  if (!response.ok) {
    const kind = response.status === 401 ? 'auth' : response.status === 429 ? 'rate' : response.status === 409 ? 'conflict'
      : response.status === 403 && ['Recent authentication is required', 'Stronger authentication is required'].includes(String(body.error)) ? 'mfa'
      : [400, 403, 404, 415].includes(response.status) ? 'denied' : 'unknown';
    throw new InvitationError(kind);
  }
  try { return parseInvitationId(body.invitationId); } catch { throw new InvitationError('unknown'); }
}
