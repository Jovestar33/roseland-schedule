import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: '40px 24px', fontFamily: 'var(--fb)' }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontSize: '32px', letterSpacing: '3px' }}>
        Roseland Schedule
      </h1>
      <p style={{ marginTop: '12px', color: '#52525b' }}>
        Phase 2 — Schedule editor. Library coming in Phase 4.
      </p>
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <Link
          href="/schedule/Untitled"
          style={{
            fontFamily: 'var(--fb)',
            fontSize: '13px',
            fontWeight: 600,
            padding: '8px 14px',
            borderRadius: '6px',
            background: 'var(--pink)',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          + New Schedule
        </Link>
      </div>
    </main>
  );
}
