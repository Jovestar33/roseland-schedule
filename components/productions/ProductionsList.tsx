'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { useProductionStore } from '@/lib/store/productionStore';
import { getLibraryMeta } from '@/lib/api/library';
import type { Production } from '@/lib/types';

function newId() {
  return crypto.randomUUID();
}

interface UnclaimedRow {
  prodKey: string;
  displayName: string;
}

export default function ProductionsList() {
  const router    = useRouter();
  const token     = useAuthStore((s) => s.token);
  const { productions, loading, loaded, load, upsertProduction } = useProductionStore();

  const [unclaimed, setUnclaimed]   = useState<UnclaimedRow[]>([]);
  const [newTitle,  setNewTitle]    = useState('');
  const [saving,    setSaving]      = useState(false);

  useEffect(() => {
    if (token && !loaded) load();
  }, [token, loaded, load]);

  useEffect(() => {
    if (!token || !loaded) return;
    getLibraryMeta(token).then((lib) => {
      const claimedKeys = new Set(productions.map((p) => p.prodKey));
      const keys = new Set<string>();
      const names: Record<string, string> = {};

      if (lib.phaseOrder) {
        for (const pk of Object.keys(lib.phaseOrder)) {
          keys.add(pk);
        }
      }
      if (lib.productionDisplayNames) {
        for (const [pk, dn] of Object.entries(lib.productionDisplayNames)) {
          keys.add(pk);
          names[pk] = dn;
        }
      }

      const rows: UnclaimedRow[] = [];
      for (const pk of keys) {
        if (!claimedKeys.has(pk)) {
          rows.push({ prodKey: pk, displayName: names[pk] ?? pk });
        }
      }
      rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setUnclaimed(rows);
    }).catch(() => {});
  }, [token, loaded, productions]);

  async function handleClaim(row: UnclaimedRow) {
    if (!token) return;
    const now = Date.now();
    const p: Production = {
      id: newId(),
      prodKey: row.prodKey,
      title: row.displayName,
      status: 'development',
      createdAt: now,
      updatedAt: now,
    };
    await upsertProduction(p);
    router.push(`/productions/${encodeURIComponent(row.prodKey)}`);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    const prodKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const now = Date.now();
    const p: Production = {
      id: newId(),
      prodKey,
      title,
      status: 'development',
      createdAt: now,
      updatedAt: now,
    };
    await upsertProduction(p);
    setSaving(false);
    setNewTitle('');
    router.push(`/productions/${encodeURIComponent(prodKey)}`);
  }

  if (loading && !loaded) {
    return <div className="pc-page"><p className="pc-loading">Loading…</p></div>;
  }

  return (
    <div className="pc-page">
      <nav className="pc-nav">
        <a href="/library" className="pc-nav-back">← Library</a>
        <h1 className="pc-page-title">Productions</h1>
      </nav>

      {productions.length > 0 && (
        <div className="pc-section">
          <div className="pc-section-label">Your productions</div>
          {productions.map((p) => (
            <ProductionCard
              key={p.id}
              production={p}
              onClick={() => router.push(`/productions/${encodeURIComponent(p.prodKey)}`)}
            />
          ))}
        </div>
      )}

      {unclaimed.length > 0 && (
        <div className="pc-section">
          <div className="pc-section-label">Untracked (from library)</div>
          {unclaimed.map((row) => (
            <div key={row.prodKey} className="pc-prod-card pc-prod-unclaimed">
              <div className="pc-prod-info">
                <div className="pc-prod-title">{row.displayName}</div>
                <div className="pc-prod-client">Not yet tracked in Productions</div>
              </div>
              <button
                className="btn btn-light btn-sm pc-claim-btn"
                onClick={() => handleClaim(row)}
              >
                Track
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pc-section">
        <div className="pc-section-label">New production</div>
        <form className="pc-new-form" onSubmit={handleAdd}>
          <input
            className="pc-new-input"
            placeholder="Production title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button
            className="btn btn-pink btn-sm pc-add-btn"
            type="submit"
            disabled={!newTitle.trim() || saving}
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>
    </div>
  );
}

function statusLabel(s: Production['status']): string {
  switch (s) {
    case 'development':    return 'Development';
    case 'pre-production': return 'Pre-Production';
    case 'in-production':  return 'In Production';
    case 'post':           return 'Post';
    case 'delivered':      return 'Delivered';
    case 'archived':       return 'Archived';
    default:               return '';
  }
}

function ProductionCard({ production: p, onClick }: { production: Production; onClick: () => void }) {
  return (
    <div className="pc-prod-card" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="pc-prod-info">
        <div className="pc-prod-title">{p.title}</div>
        {p.clientName && <div className="pc-prod-client">{p.clientName}</div>}
      </div>
      {p.status && (
        <span className={`pc-status-pill ${p.status}`}>{statusLabel(p.status)}</span>
      )}
    </div>
  );
}
