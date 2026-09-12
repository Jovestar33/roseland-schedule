import assert from 'node:assert/strict';
import test from 'node:test';
import { findBlockingAdvisorFindings } from '../../lib/security/supabase-advisor.ts';

test('blocks every local advisor warning', () => {
  const findings = [{
    level: 'WARN',
    cache_key: 'anon_security_definer_function_executable_public_example_',
  }];

  assert.deepEqual(findBlockingAdvisorFindings(findings, 'local'), findings);
});

test('allows only reviewed linked-project warnings', () => {
  const reviewed = {
    level: 'WARN',
    cache_key:
      'authenticated_security_definer_function_executable_public_accept_organization_invitation_invitation_id uuid',
  };
  const unknown = {
    level: 'WARN',
    cache_key: 'anon_security_definer_function_executable_public_example_',
  };

  assert.deepEqual(
    findBlockingAdvisorFindings([reviewed, unknown], 'linked'),
    [unknown],
  );
});

test('always blocks error-level findings', () => {
  const finding = {
    level: 'ERROR',
    cache_key: 'auth_leaked_password_protection',
  };

  assert.deepEqual(findBlockingAdvisorFindings([finding], 'linked'), [finding]);
});
