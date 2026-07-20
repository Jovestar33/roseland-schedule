import { NextRequest } from 'next/server';
import { parseCreateInvitationInput } from '@/lib/platform/contracts';
import {
  assertPlatformWorkflowsEnabled,
  authenticatePlatformRequest,
  callPlatformRpc,
  platformError,
  platformJson,
  readPlatformJson,
  workflowRequestId,
} from '@/lib/platform/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let requestId: string | undefined;
  try {
    assertPlatformWorkflowsEnabled();
    requestId = workflowRequestId(request);
    const body = parseCreateInvitationInput(await readPlatformJson(request));
    const { actor, config } = await authenticatePlatformRequest(request, 30 * 60);
    const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const invitationId = await callPlatformRpc(config, 'create_organization_invitation', {
      p_actor_user_id: actor.userId,
      p_organization_id: body.organizationId,
      p_email: body.email,
      p_organization_role: body.organizationRole,
      p_production_id: body.productionId,
      p_production_role: body.productionRole,
      p_expires_at: expiresAt,
      p_actor_aal: actor.aal,
      p_actor_authenticated_at: actor.authenticatedAt,
      p_request_id: requestId,
    });

    return platformJson({ invitationId, requestId }, 201, requestId);
  } catch (error) {
    return platformError(error, requestId);
  }
}
