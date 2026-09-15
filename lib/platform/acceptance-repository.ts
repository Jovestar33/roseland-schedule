import type { SupabaseClient } from '@supabase/supabase-js';
import { parseInvitationId } from './contracts.ts';
import { AcceptanceError, type AcceptanceAttempt, type AcceptanceReceipt, type AcceptanceRepository } from './acceptance-controller.ts';
export function createAcceptanceRepository(client: SupabaseClient): AcceptanceRepository {
  async function bound(attempt: AcceptanceAttempt) {
    const result = await client.auth.getSession();
    if (result.error || !result.data.session || result.data.session.user.id !== attempt.actor) throw new AcceptanceError('auth');
    return result.data.session.access_token;
  }
  function failure(error: { code?: string } | null, status: number) {
    if (error) throw new AcceptanceError(status === 401 ? 'auth' : error.code === 'P0001' || [400,403,404].includes(status) ? 'unavailable' : 'unknown');
  }
  return {
    async accept(attempt) {
      const token = await bound(attempt);
      const response = await client.rpc('accept_organization_invitation', { invitation_id: attempt.invitationId }).setHeader('Authorization', `Bearer ${token}`);
      failure(response.error, response.status);
      return parseInvitationId(response.data);
    },
    async receipt(attempt): Promise<AcceptanceReceipt | null> {
      const token = await bound(attempt);
      const response = await client.rpc('get_my_invitation_acceptance', { invitation_id: attempt.invitationId }, { get: true }).setHeader('Authorization', `Bearer ${token}`);
      failure(response.error, response.status);
      if (response.data === null) return null;
      const value = response.data;
      if (!value || typeof value.acceptedAt !== 'string' || !Number.isFinite(Date.parse(value.acceptedAt)) || value.invitationId !== attempt.invitationId) throw new AcceptanceError('unknown');
      return { invitationId: parseInvitationId(value.invitationId), organizationId: parseInvitationId(value.organizationId), acceptedAt: value.acceptedAt };
    },
  };
}
