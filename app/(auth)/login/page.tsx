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

  // Already authenticated — skip straight to app
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
        background: '#fafafa',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid #e4e4e7',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          padding: '40px 32px 36px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-login.png"
            alt="Roseland Pictures"
            style={{ maxWidth: '240px', height: 'auto', display: 'block', margin: '0 auto' }}
          />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '15px',
                fontFamily: 'var(--fb)',
                border: '1px solid #d4d4d8',
                borderRadius: '6px',
                outline: 'none',
                boxSizing: 'border-box',
                background: '#fff',
                color: '#111',
              }}
            />
          </div>

          {error && (
            <div
              role="alert"
              style={{
                fontSize: '13px',
                fontFamily: 'var(--fb)',
                color: '#9d1468',
                marginBottom: '12px',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            style={{
              width: '100%',
              padding: '11px',
              fontSize: '13px',
              fontFamily: 'var(--fb)',
              fontWeight: 600,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: '#fff',
              background:
                loading || !password.trim()
                  ? '#d4d4d8'
                  : 'var(--pink, #e91e8c)',
              border: 'none',
              borderRadius: '6px',
              cursor: loading || !password.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
