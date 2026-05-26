'use client';
import { useEffect, useState } from 'react';
import { useProductionStore } from '@/lib/store/productionStore';
import type { Production, ProductionStatus } from '@/lib/types';

const STATUSES: { value: ProductionStatus; label: string }[] = [
  { value: 'development',    label: 'Development' },
  { value: 'pre-production', label: 'Pre-Production' },
  { value: 'in-production',  label: 'In Production' },
  { value: 'post',           label: 'Post' },
  { value: 'delivered',      label: 'Delivered' },
  { value: 'archived',       label: 'Archived' },
];

interface Props {
  production: Production;
}

export default function ProductionSettings({ production: p }: Props) {
  const upsertProduction = useProductionStore((s) => s.upsertProduction);
  const removeProduction = useProductionStore((s) => s.removeProduction);

  const [title,      setTitle]      = useState(p.title);
  const [client,     setClient]     = useState(p.clientName ?? '');
  const [status,     setStatus]     = useState<ProductionStatus>(p.status ?? 'development');
  const [notes,      setNotes]      = useState(p.notes ?? '');
  const [hospital,   setHospital]   = useState(p.callSheetDefaults?.hospital ?? '');
  const [parking,    setParking]    = useState(p.callSheetDefaults?.parking ?? '');
  const [basecamp,   setBasecamp]   = useState(p.callSheetDefaults?.basecamp ?? '');
  const [emergency,  setEmergency]  = useState(p.callSheetDefaults?.emergency ?? '');
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);

  useEffect(() => {
    setTitle(p.title);
    setClient(p.clientName ?? '');
    setStatus(p.status ?? 'development');
    setNotes(p.notes ?? '');
    setHospital(p.callSheetDefaults?.hospital ?? '');
    setParking(p.callSheetDefaults?.parking ?? '');
    setBasecamp(p.callSheetDefaults?.basecamp ?? '');
    setEmergency(p.callSheetDefaults?.emergency ?? '');
  }, [p]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await upsertProduction({
      ...p,
      title: title.trim(),
      clientName: client.trim() || undefined,
      status,
      notes: notes.trim() || undefined,
      callSheetDefaults: {
        hospital:  hospital.trim()  || undefined,
        parking:   parking.trim()   || undefined,
        basecamp:  basecamp.trim()  || undefined,
        emergency: emergency.trim() || undefined,
      },
      updatedAt: Date.now(),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${p.title}" and all its days? This cannot be undone.`)) return;
    await removeProduction(p.id);
    window.location.href = '/productions';
  }

  return (
    <form className="pc-settings" onSubmit={handleSave}>
      <div className="pc-settings-sh">Production</div>

      <div className="pc-form-row">
        <label className="pc-form-label">Title</label>
        <input className="pc-form-input" value={title}
          onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="pc-form-row">
        <label className="pc-form-label">Client</label>
        <input className="pc-form-input" value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Client or brand name" />
      </div>

      <div className="pc-form-row">
        <label className="pc-form-label">Status</label>
        <select className="pc-form-select" value={status}
          onChange={(e) => setStatus(e.target.value as ProductionStatus)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="pc-form-row">
        <label className="pc-form-label">Notes</label>
        <textarea className="pc-form-ta" value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Brief synopsis, production notes, etc." />
      </div>

      <div className="pc-settings-sh" style={{ marginTop: 8 }}>Call sheet defaults</div>

      <div className="pc-form-row">
        <label className="pc-form-label">Basecamp / Unit Base</label>
        <input className="pc-form-input" value={basecamp}
          onChange={(e) => setBasecamp(e.target.value)} placeholder="Default unit base address" />
      </div>

      <div className="pc-form-row">
        <label className="pc-form-label">Crew Parking</label>
        <input className="pc-form-input" value={parking}
          onChange={(e) => setParking(e.target.value)} placeholder="Default parking address" />
      </div>

      <div className="pc-form-row">
        <label className="pc-form-label">Nearest Hospital</label>
        <input className="pc-form-input" value={hospital}
          onChange={(e) => setHospital(e.target.value)} placeholder="Default hospital name and address" />
      </div>

      <div className="pc-form-row">
        <label className="pc-form-label">Emergency Contact</label>
        <input className="pc-form-input" value={emergency}
          onChange={(e) => setEmergency(e.target.value)} placeholder="Name and phone number" />
      </div>

      <div className="pc-settings-save" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-pink btn-sm" type="submit" disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>

      <div style={{ marginTop: 32 }}>
        <div className="pc-settings-sh">Danger zone</div>
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: 8, color: '#c53030', border: '1px solid #c53030', background: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 12px', fontSize: 12 }}
          onClick={handleDelete}
        >
          Delete production
        </button>
      </div>
    </form>
  );
}
