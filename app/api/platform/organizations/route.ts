import { NextRequest } from 'next/server';
import { parseProvisionOrganizationInput } from '@/lib/platform/contracts';
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
    const body = parseProvisionOrganizationInput(await readPlatformJson(request));
    const { actor, config } = await authenticatePlatformRequest(request, 15 * 60);
    const organizationId = await callPlatformRpc(config, 'provision_customer_organization', {
      p_actor_user_id: actor.userId,
      p_owner_user_id: body.ownerUserId,
      p_organization_name: body.name,
      p_organization_slug: body.slug,
      p_organization_timezone: body.timezone,
      p_organization_locale: body.locale,
      p_organization_country_code: body.countryCode,
      p_organization_currency: body.currency,
      p_operator_reason: body.reason,
      p_actor_aal: actor.aal,
      p_actor_authenticated_at: actor.authenticatedAt,
      p_request_id: requestId,
    });

    return platformJson({ organizationId, requestId }, 201, requestId);
  } catch (error) {
    return platformError(error, requestId);
  }
}
