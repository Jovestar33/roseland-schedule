'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import loginLogoImg from '@/public/logo-login.png';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, hydrated, hydrate } = useAuthStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function getRedirectTarget(): string {
    if (typeof window === 'undefined') return '/';
    const next = new URLSearchParams(window.location.search).get('next');
    return next && next.startsWith('/') ? next : '/';
  }

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && isAuthenticated) {
      router.replace(getRedirectTarget());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setError('');
    setLoading(true);
    const result = await login(password);
    setLoading(false);
    if (result.ok) {
      router.replace(getRedirectTarget());
    } else {
      setError(result.error ?? 'Incorrect password');
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 18%, rgba(216,42,137,.22), transparent 32%), linear-gradient(180deg,#111116 0%,#050507 100%)',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 'min(460px, 100%)',
          border: '1px solid rgba(255,255,255,.13)',
          borderRadius: '22px',
          background: 'rgba(255,255,255,.97)',
          boxShadow: '0 28px 90px rgba(0,0,0,.48)',
          padding: '30px',
          boxSizing: 'border-box',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        }}
      >
        {/* Logo — imported as static asset so it lands in _next/static/media/ */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={loginLogoImg.src}
            alt="Roseland Pictures"
            style={{ display: 'block', height: '124px', width: 'auto', maxWidth: '360px', margin: '0 auto', objectFit: 'contain' }}
          />
        </div>

        {/* Heading */}
        <h2
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--fd, "Bebas Neue", system-ui, sans-serif)',
            fontSize: '32px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#111',
          }}
        >
          Editor Access
        </h2>
        <p style={{ margin: '0 0 18px', color: '#6b7280', fontSize: '13px', lineHeight: 1.45 }}>
          Enter the editor password to continue.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Hidden decoy inputs absorb browser autofill before the real field */}
          <input type="text" name="username" autoComplete="username" aria-hidden="true" tabIndex={-1} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
          <input type="password" name="password" autoComplete="current-password" aria-hidden="true" tabIndex={-1} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="password"
              id="editor-password"
              name="editor-password"
              autoComplete="new-password"
              placeholder="Password…"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={loading}
              style={{
                flex: 1,
                minWidth: 0,
                height: '44px',
                padding: '0 12px',
                border: '1px solid #d1d5db',
                borderRadius: '10px',
                font: 'inherit',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                background: '#fff',
                color: '#111',
              }}
            />
            <button
              type="submit"
              disabled={loading || !password.trim()}
              style={{
                height: '44px',
                border: 0,
                borderRadius: '10px',
                background: loading || !password.trim() ? '#d1d5db' : '#d82a89',
                color: '#fff',
                padding: '0 18px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: loading || !password.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Checking…' : 'Unlock'}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              style={{ marginTop: '10px', minHeight: '18px', color: '#b91c1c', fontSize: '12px' }}
            >
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
