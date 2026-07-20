import { NextRequest } from 'next/server';
import { parseInvitationId, parseRevokeInvitationInput } from '@/lib/platform/contracts';
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

type RouteContext = {
  params: Promise<{ invitationId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  let requestId: string | undefined;
  try {
    assertPlatformWorkflowsEnabled();
    requestId = workflowRequestId(request);
    const invitationId = parseInvitationId((await context.params).invitationId);
    const body = parseRevokeInvitationInput(await readPlatformJson(request));
    const { actor, config } = await authenticatePlatformRequest(request, 30 * 60);
    const revokedInvitationId = await callPlatformRpc(config, 'revoke_organization_invitation', {
      p_actor_user_id: actor.userId,
      p_invitation_id: invitationId,
      p_reason: body.reason,
      p_actor_aal: actor.aal,
      p_actor_authenticated_at: actor.authenticatedAt,
      p_request_id: requestId,
    });

    return platformJson({ invitationId: revokedInvitationId, requestId }, 200, requestId);
  } catch (error) {
    return platformError(error, requestId);
  }
}
