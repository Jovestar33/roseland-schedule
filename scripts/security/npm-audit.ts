import { spawnSync } from 'node:child_process';
import { classifyNpmAuditResult } from '../../lib/security/npm-audit.ts';

const result = spawnSync(
  'npm',
  ['audit', '--omit=dev', '--audit-level=high', '--json'],
  {
    encoding: 'utf8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  },
);

const classification = classifyNpmAuditResult({
  status: result.status,
  stdout: result.stdout ?? '',
  stderr: result.stderr ?? '',
  error: result.error,
});

switch (classification.kind) {
  case 'pass':
    console.log('npm audit found no high or critical runtime vulnerabilities.');
    process.exitCode = 0;
    break;
  case 'vulnerable':
    console.error(
      `npm audit found ${classification.high} high and ${classification.critical} critical runtime vulnerabilities.`,
    );
    process.exitCode = 1;
    break;
  case 'service-unavailable':
    console.warn(
      `::warning title=npm audit service unavailable::${classification.detail}`,
    );
    console.warn(
      'The registry audit result is temporarily unavailable; GitHub Dependency Review and Dependabot remain independent gates.',
    );
    process.exitCode = 0;
    break;
  case 'error':
    console.error(`npm audit failed without a usable report: ${classification.detail}`);
    process.exitCode = 1;
    break;
}
