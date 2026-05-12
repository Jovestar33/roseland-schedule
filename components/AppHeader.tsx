export default function AppHeader() {
  return (
    <div className="hdr" style={{ display: 'flex', alignItems: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-header.png" alt="Roseland Pictures" style={{ height: '88px', width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }} />
      <span className="hdr-title" style={{ flex: 1, textAlign: 'center', fontSize: '22px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: '#fff', fontFamily: 'var(--fd, "Bebas Neue", system-ui, sans-serif)' }}>
        Production Schedule
      </span>
    </div>
  );
}
