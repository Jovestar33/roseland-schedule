export interface NpmAuditProcessResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type NpmAuditClassification =
  | { kind: 'pass'; high: number; critical: number }
  | { kind: 'vulnerable'; high: number; critical: number }
  | { kind: 'service-unavailable'; detail: string }
  | { kind: 'error'; detail: string };

interface NpmAuditReport {
  metadata?: {
    vulnerabilities?: {
      high?: number;
      critical?: number;
    };
  };
  error?: {
    code?: string;
    summary?: string;
    detail?: string;
  };
}

const transientAuditPatterns = [
  /audit endpoint returned an error/i,
  /\/security\/advisories\/bulk/i,
  /invalid json response body/i,
  /\bEAI_AGAIN\b/i,
  /\bECONNRESET\b/i,
  /\bENOTFOUND\b/i,
  /\bETIMEDOUT\b/i,
  /\b(?:502|503|504)\b.*(?:bad gateway|service unavailable|gateway timeout)/i,
];

function compactDetail(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function isTransientAuditFailure(value: string): boolean {
  return transientAuditPatterns.some((pattern) => pattern.test(value));
}

export function classifyNpmAuditResult(
  result: NpmAuditProcessResult,
): NpmAuditClassification {
  const combined = [result.stdout, result.stderr, result.error?.message]
    .filter(Boolean)
    .join('\n');

  let report: NpmAuditReport | undefined;
  try {
    report = JSON.parse(result.stdout) as NpmAuditReport;
  } catch {
    report = undefined;
  }

  const vulnerabilities = report?.metadata?.vulnerabilities;
  if (vulnerabilities) {
    const high = vulnerabilities.high ?? 0;
    const critical = vulnerabilities.critical ?? 0;
    return high > 0 || critical > 0
      ? { kind: 'vulnerable', high, critical }
      : { kind: 'pass', high, critical };
  }

  const reportError = [
    report?.error?.code,
    report?.error?.summary,
    report?.error?.detail,
  ]
    .filter(Boolean)
    .join('\n');

  if (isTransientAuditFailure(`${combined}\n${reportError}`)) {
    return {
      kind: 'service-unavailable',
      detail: compactDetail(reportError || combined || 'npm audit service unavailable'),
    };
  }

  return {
    kind: 'error',
    detail: compactDetail(
      reportError
        || combined
        || `npm audit exited without a usable report (status ${String(result.status)})`,
    ),
  };
}
