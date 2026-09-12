import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyNpmAuditResult } from '../../lib/security/npm-audit.ts';

test('passes a clean npm audit report', () => {
  const result = classifyNpmAuditResult({
    status: 0,
    stdout: JSON.stringify({
      metadata: { vulnerabilities: { low: 0, moderate: 0, high: 0, critical: 0 } },
    }),
    stderr: '',
  });

  assert.deepEqual(result, { kind: 'pass', high: 0, critical: 0 });
});

test('allows findings below the high-severity gate', () => {
  const result = classifyNpmAuditResult({
    status: 0,
    stdout: JSON.stringify({
      metadata: { vulnerabilities: { low: 2, moderate: 1, high: 0, critical: 0 } },
    }),
    stderr: '',
  });

  assert.equal(result.kind, 'pass');
});

test('blocks high or critical vulnerabilities', () => {
  const result = classifyNpmAuditResult({
    status: 1,
    stdout: JSON.stringify({
      metadata: { vulnerabilities: { high: 2, critical: 1 } },
    }),
    stderr: '',
  });

  assert.deepEqual(result, { kind: 'vulnerable', high: 2, critical: 1 });
});

test('recognizes the npm registry bulk-advisory outage', () => {
  const result = classifyNpmAuditResult({
    status: 1,
    stdout: '',
    stderr:
      'invalid json response body at https://registry.npmjs.org/-/npm/v1/security/advisories/bulk\n'
      + 'audit endpoint returned an error',
  });

  assert.equal(result.kind, 'service-unavailable');
});

test('fails closed for an unrecognized audit error', () => {
  const result = classifyNpmAuditResult({
    status: 1,
    stdout: JSON.stringify({
      error: { code: 'EAUDIT', summary: 'Invalid package tree' },
    }),
    stderr: '',
  });

  assert.equal(result.kind, 'error');
});
