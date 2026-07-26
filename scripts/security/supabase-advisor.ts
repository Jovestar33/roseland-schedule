import { spawnSync } from 'node:child_process';
import {
  findBlockingAdvisorFindings,
  type SupabaseAdvisorFinding,
} from '../../lib/security/supabase-advisor.ts';

const target = process.argv.includes('--linked') ? 'linked' : 'local';
const executable = `${process.cwd()}/node_modules/.bin/supabase`;
const result = spawnSync(
  executable,
  [
    'db',
    'advisors',
    `--${target}`,
    '--type',
    'security',
    '--level',
    'warn',
    '--fail-on',
    'none',
    '--output',
    'json',
  ],
  {
    encoding: 'utf8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  },
);

if (result.error || result.status !== 0) {
  console.error(result.stderr || result.error?.message || 'Supabase security advisor failed.');
  process.exit(1);
}

const output = result.stdout.trim();
let findings: SupabaseAdvisorFinding[] = [];

if (output.startsWith('[')) {
  try {
    findings = JSON.parse(output) as SupabaseAdvisorFinding[];
  } catch {
    console.error('Supabase security advisor returned malformed JSON.');
    process.exit(1);
  }
} else if (output && !/No issues found/i.test(output)) {
  console.error(`Supabase security advisor returned an unexpected response: ${output}`);
  process.exit(1);
}

const blocking = findBlockingAdvisorFindings(findings, target);
if (blocking.length > 0) {
  for (const finding of blocking) {
    console.error(
      `${finding.level ?? 'WARN'} ${finding.cache_key ?? finding.name ?? 'unknown'}: ${finding.detail ?? finding.title ?? ''}`,
    );
  }
  process.exit(1);
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.warn(
      `Accepted ${finding.level ?? 'WARN'} ${finding.cache_key ?? finding.name ?? 'unknown'}: ${finding.detail ?? finding.title ?? ''}`,
    );
  }
}

console.log(
  `Supabase ${target} security advisor passed (${findings.length} accepted warning${findings.length === 1 ? '' : 's'}).`,
);
