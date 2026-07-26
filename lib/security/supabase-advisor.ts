export interface SupabaseAdvisorFinding {
  name?: string;
  title?: string;
  level?: string;
  detail?: string;
  cache_key?: string;
}

const linkedAllowlist = new Set([
  'authenticated_security_definer_function_executable_public_accept_organization_invitation_invitation_id uuid',
  'authenticated_security_definer_function_executable_public_can_access_production_target_production_id uuid',
  'authenticated_security_definer_function_executable_public_can_edit_production_target_production_id uuid',
  'authenticated_security_definer_function_executable_public_is_active_org_member_target_organization_id uuid',
  'authenticated_security_definer_function_executable_public_is_org_admin_target_organization_id uuid',
  'auth_leaked_password_protection',
]);

export function findBlockingAdvisorFindings(
  findings: SupabaseAdvisorFinding[],
  target: 'local' | 'linked',
): SupabaseAdvisorFinding[] {
  return findings.filter((finding) => {
    const level = finding.level?.toUpperCase();
    if (level === 'ERROR') return true;
    if (level !== 'WARN') return false;
    return target !== 'linked' || !linkedAllowlist.has(finding.cache_key ?? '');
  });
}
