'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, hydrated, hydrate } = useAuthStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && isAuthenticated) {
      router.replace('/');
    }
  }, [hydrated, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setError('');
    setLoading(true);
    const result = await login(password);
    setLoading(false);
    if (result.ok) {
      router.replace('/');
    } else {
      setError(result.error ?? 'Incorrect password');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-login.png"
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
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="password"
              id=""
              name="fake-password"
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
