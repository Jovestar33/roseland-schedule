'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import styles from './setup.module.css';

type Stage =
  | 'checking'
  | 'signed-out'
  | 'enrollment-required'
  | 'enrolling'
  | 'challenge-required'
  | 'ready';

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

type Props = {
  supabaseUrl: string;
  publishableKey: string;
  projectRef: string;
};

function normalizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

function qrCodeSource(value: string): string {
  if (value.startsWith('data:image/')) return value;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(value)}`;
}

function friendlyError(stage: 'signin' | 'mfa' | 'setup'): string {
  if (stage === 'signin') {
    return 'Sign-in failed. Check the development account email and password, then try again.';
  }
  if (stage === 'mfa') {
    return 'That six-digit code could not be verified. Wait for a new code and try again.';
  }
  return 'Account setup could not continue. Sign out, sign in again, and retry.';
}

async function inspectSession(
  supabase: SupabaseClient,
): Promise<{
  stage: Stage;
  email: string;
  userId: string;
  verifiedFactorId: string | null;
}> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return {
      stage: 'signed-out',
      email: '',
      userId: '',
      verifiedFactorId: null,
    };
  }

  const [{ data: aal, error: aalError }, { data: factors, error: factorsError }] =
    await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

  if (aalError || factorsError || !aal || !factors) {
    throw new Error('Unable to inspect the authenticated session.');
  }

  const verifiedFactorId = factors.totp[0]?.id ?? null;
  let stage: Stage = 'enrollment-required';
  if (aal.currentLevel === 'aal2') {
    stage = 'ready';
  } else if (verifiedFactorId) {
    stage = 'challenge-required';
  }

  return {
    stage,
    email: userData.user.email ?? 'Development user',
    userId: userData.user.id,
    verifiedFactorId,
  };
}

export default function AuthSetupClient({
  supabaseUrl,
  publishableKey,
  projectRef,
}: Props) {
  const supabase = useMemo(
    () => createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    }),
    [publishableKey, supabaseUrl],
  );

  const [stage, setStage] = useState<Stage>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refreshState() {
    const state = await inspectSession(supabase);
    setStage(state.stage);
    setUserEmail(state.email);
    setUserId(state.userId);
    setVerifiedFactorId(state.verifiedFactorId);
    if (state.stage === 'ready') {
      setEnrollment(null);
      setCode('');
      setShowSecret(false);
    }
  }

  useEffect(() => {
    let active = true;

    inspectSession(supabase)
      .then((state) => {
        if (!active) return;
        setStage(state.stage);
        setUserEmail(state.email);
        setUserId(state.userId);
        setVerifiedFactorId(state.verifiedFactorId);
      })
      .catch(() => {
        if (!active) return;
        setError(friendlyError('setup'));
        setStage('signed-out');
      });

    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setPassword('');
      if (signInError) {
        setError(friendlyError('signin'));
        return;
      }
      await refreshState();
    } catch {
      setPassword('');
      setError(friendlyError('signin'));
    } finally {
      setBusy(false);
    }
  }

  async function beginEnrollment() {
    setBusy(true);
    setError('');

    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError || !factors) throw new Error('Unable to list factors.');

      const staleTotpFactors = factors.all.filter(
        (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
      );
      for (const factor of staleTotpFactors) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (unenrollError) throw new Error('Unable to replace an unfinished factor.');
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Roseland development authenticator',
      });
      if (enrollError || !data) throw new Error('Unable to enroll a factor.');

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode('');
      setShowSecret(false);
      setStage('enrolling');
    } catch {
      setError(friendlyError('setup'));
    } finally {
      setBusy(false);
    }
  }

  async function verifyFactor(factorId: string) {
    if (code.length !== 6) {
      setError('Enter the six-digit code from your authenticator app.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (verifyError) {
        setError(friendlyError('mfa'));
        return;
      }
      await refreshState();
    } catch {
      setError(friendlyError('mfa'));
    } finally {
      setBusy(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const factorId = stage === 'enrolling' ? enrollment?.factorId : verifiedFactorId;
    if (!factorId) {
      setError(friendlyError('setup'));
      return;
    }
    await verifyFactor(factorId);
  }

  async function signOut() {
    setBusy(true);
    setError('');
    await supabase.auth.signOut({ scope: 'local' });
    setStage('signed-out');
    setUserEmail('');
    setUserId('');
    setVerifiedFactorId(null);
    setEnrollment(null);
    setCode('');
    setShowSecret(false);
    setBusy(false);
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="setup-title">
        <div className={styles.eyebrow}>
          <span className={styles.statusDot} aria-hidden="true" />
          Isolated development environment
        </div>

        <header className={styles.header}>
          <p className={styles.kicker}>Roseland Schedule</p>
          <h1 id="setup-title">Secure account setup</h1>
          <p>
            Sign in to the development account and add an authenticator app.
            This does not replace or modify the live app login.
          </p>
        </header>

        <div className={styles.project}>
          <span>Supabase project</span>
          <code>{projectRef}</code>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {stage === 'checking' && (
          <div className={styles.loading} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            Checking the development session…
          </div>
        )}

        {stage === 'signed-out' && (
          <form className={styles.form} onSubmit={handleSignIn}>
            <label>
              Development account email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
                disabled={busy}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={busy}
              />
            </label>
            <button className={styles.primaryButton} type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Continue securely'}
            </button>
          </form>
        )}

        {stage !== 'checking' && stage !== 'signed-out' && stage !== 'ready' && (
          <div className={styles.identity}>
            <div>
              <span>Signed in as</span>
              <strong>{userEmail}</strong>
            </div>
            <button type="button" onClick={signOut} disabled={busy}>
              Sign out
            </button>
          </div>
        )}

        {stage === 'enrollment-required' && (
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <div>
              <h2>Add an authenticator</h2>
              <p>
                Use 1Password, Google Authenticator, Microsoft Authenticator,
                Authy, or another TOTP-compatible app.
              </p>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={beginEnrollment}
                disabled={busy}
              >
                {busy ? 'Preparing…' : 'Set up authenticator'}
              </button>
            </div>
          </div>
        )}

        {stage === 'enrolling' && enrollment && (
          <form className={styles.form} onSubmit={handleMfaSubmit}>
            <div className={styles.qrPanel}>
              <Image
                src={qrCodeSource(enrollment.qrCode)}
                alt="QR code for the development account authenticator"
                width="220"
                height="220"
                unoptimized
              />
              <div>
                <h2>Scan this QR code</h2>
                <p>
                  Add it to your authenticator app, then enter the current
                  six-digit code below.
                </p>
                <label className={styles.secretField}>
                  Manual setup key
                  <div>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={enrollment.secret}
                      readOnly
                      autoComplete="off"
                      aria-label="Manual authenticator setup key"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((visible) => !visible)}
                    >
                      {showSecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              </div>
            </div>
            <label>
              Six-digit authenticator code
              <input
                className={styles.codeInput}
                value={code}
                onChange={(event) => setCode(normalizeCode(event.target.value))}
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                placeholder="000000"
                required
                disabled={busy}
              />
            </label>
            <button className={styles.primaryButton} type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify and finish'}
            </button>
          </form>
        )}

        {stage === 'challenge-required' && (
          <form className={styles.form} onSubmit={handleMfaSubmit}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div>
                <h2>Verify your authenticator</h2>
                <p>
                  This account already has MFA. Enter the current code to
                  upgrade this development session to AAL2.
                </p>
              </div>
            </div>
            <label>
              Six-digit authenticator code
              <input
                className={styles.codeInput}
                value={code}
                onChange={(event) => setCode(normalizeCode(event.target.value))}
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                placeholder="000000"
                required
                autoFocus
                disabled={busy}
              />
            </label>
            <button className={styles.primaryButton} type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify session'}
            </button>
          </form>
        )}

        {stage === 'ready' && (
          <div className={styles.ready}>
            <div className={styles.check} aria-hidden="true">✓</div>
            <p className={styles.readyLabel}>AAL2 verified</p>
            <h2>Your development account is ready.</h2>
            <p>
              The next step is the controlled, one-time Roseland organization
              bootstrap. Tell Codex that MFA is complete; do not send your
              password or authenticator code.
            </p>
            <dl>
              <div>
                <dt>Account</dt>
                <dd>{userEmail}</dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd><code>{userId}</code></dd>
              </div>
            </dl>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={signOut}
              disabled={busy}
            >
              Sign out of setup
            </button>
          </div>
        )}

        <footer>
          <span>Development only</span>
          No production schedule data is read or changed here.
        </footer>
      </section>
    </main>
  );
}
