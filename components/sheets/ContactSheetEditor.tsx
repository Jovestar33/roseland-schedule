'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/store/authStore';
import { loadSheetMeta, saveSheetMeta, defaultSheetMeta } from '@/lib/api/sheets';
import { postLoad } from '@/lib/api/load';
import type { SheetMeta, ScheduleData, ClientRep, AdditionalCrew, DietaryRestriction } from '@/lib/types';
import SheetPreviewHeader from './SheetPreviewHeader';
import DistributionListEditor from './DistributionListEditor';
import RepeatableRow from './RepeatableRow';
import SendModal from './SendModal';

interface Props {
  name: string;
}

function blankClientRep(): ClientRep {
  return { name: '', title: '', phone: '', email: '' };
}
function blankCrew(): AdditionalCrew {
  return { name: '', role: '', phone: '', email: '' };
}
function blankDietary(): DietaryRestriction {
  return { name: '', notes: '' };
}

export default function ContactSheetEditor({ name }: Props) {
  const token = useAuthStore((s) => s.token) ?? '';

  const [meta, setMeta] = useState<SheetMeta>(defaultSheetMeta());
  const [schedData, setSchedData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      loadSheetMeta(name, token),
      postLoad(name, token),
    ]).then(([sm, sd]) => {
      setMeta(sm);
      setSchedData(sd);
    }).catch(console.error).finally(() => setLoading(false));
  }, [name, token]);

  const save = useCallback(async (updated: SheetMeta) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveSheetMeta(name, updated, token);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  }, [name, token]);

  function update(patch: Partial<SheetMeta>) {
    setMeta((prev) => ({ ...prev, ...patch }));
  }

  if (loading) return <div className="sheet-loading">Loading…</div>;

  const scheduleMeta = schedData?.meta;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const contactSheetUrl = `${origin}/view/contactsheet/${encodeURIComponent(name)}`;
  const callSheetUrl = `${origin}/view/callsheet/${encodeURIComponent(name)}`;

  return (
    <div className="sheet-page">
      {/* Action bar */}
      <div className="sheet-actionbar">
        <div className="sheet-actionbar-title">Contact Sheet — {name}</div>
        <div className="sheet-actionbar-btns">
          <button
            className="btn btn-light btn-sm"
            onClick={() => window.open(contactSheetUrl, '_blank')}
          >
            View Public Link
          </button>
          <button
            className="btn btn-light btn-sm"
            onClick={() => setShowSend(true)}
          >
            ✉ Send
          </button>
          <button
            className="btn btn-pink btn-sm"
            disabled={saving}
            onClick={() => save(meta)}
          >
            {saving ? 'Saving…' : saveMsg ?? 'Save'}
          </button>
        </div>
      </div>

      <div className="sheet-layout">
        {/* ── Edit panel ── */}
        <div className="sheet-edit-panel">

          {/* Distribution list */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Distribution List</div>
            <DistributionListEditor
              value={meta.distributionList}
              onChange={(v) => update({ distributionList: v })}
            />
          </div>

          {/* Client reps */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Client Representatives</div>
            <div className="repeatable-list">
              {meta.clientReps.map((rep, i) => (
                <RepeatableRow
                  key={i}
                  onRemove={() => update({ clientReps: meta.clientReps.filter((_, j) => j !== i) })}
                  columns="1fr 1fr"
                >
                  <input className="sheet-input" placeholder="Name" value={rep.name}
                    onChange={(e) => update({ clientReps: meta.clientReps.map((r, j) => j === i ? { ...r, name: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Title" value={rep.title}
                    onChange={(e) => update({ clientReps: meta.clientReps.map((r, j) => j === i ? { ...r, title: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Phone" value={rep.phone}
                    onChange={(e) => update({ clientReps: meta.clientReps.map((r, j) => j === i ? { ...r, phone: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Email" type="email" value={rep.email}
                    onChange={(e) => update({ clientReps: meta.clientReps.map((r, j) => j === i ? { ...r, email: e.target.value } : r) })} />
                </RepeatableRow>
              ))}
              <button className="repeatable-add" type="button"
                onClick={() => update({ clientReps: [...meta.clientReps, blankClientRep()] })}>
                + Add client rep
              </button>
            </div>
          </div>

          {/* Emergency contact */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Emergency Contact</div>
            <div className="sheet-field-row">
              <div className="sheet-field">
                <label>Name</label>
                <input className="sheet-input" value={meta.emergencyContact.name}
                  onChange={(e) => update({ emergencyContact: { ...meta.emergencyContact, name: e.target.value } })} />
              </div>
              <div className="sheet-field">
                <label>Phone</label>
                <input className="sheet-input" value={meta.emergencyContact.phone}
                  onChange={(e) => update({ emergencyContact: { ...meta.emergencyContact, phone: e.target.value } })} />
              </div>
            </div>
            <div className="sheet-field-row--1 sheet-field-row">
              <div className="sheet-field">
                <label>Backup Phone</label>
                <input className="sheet-input" value={meta.emergencyContact.backupPhone}
                  onChange={(e) => update({ emergencyContact: { ...meta.emergencyContact, backupPhone: e.target.value } })} />
              </div>
            </div>
          </div>

          {/* Additional crew */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Additional Crew / Contacts</div>
            <div className="repeatable-list">
              {meta.additionalCrew.map((c, i) => (
                <RepeatableRow
                  key={i}
                  onRemove={() => update({ additionalCrew: meta.additionalCrew.filter((_, j) => j !== i) })}
                  columns="1fr 1fr"
                >
                  <input className="sheet-input" placeholder="Name" value={c.name}
                    onChange={(e) => update({ additionalCrew: meta.additionalCrew.map((r, j) => j === i ? { ...r, name: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Role" value={c.role}
                    onChange={(e) => update({ additionalCrew: meta.additionalCrew.map((r, j) => j === i ? { ...r, role: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Phone" value={c.phone}
                    onChange={(e) => update({ additionalCrew: meta.additionalCrew.map((r, j) => j === i ? { ...r, phone: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Email" type="email" value={c.email}
                    onChange={(e) => update({ additionalCrew: meta.additionalCrew.map((r, j) => j === i ? { ...r, email: e.target.value } : r) })} />
                </RepeatableRow>
              ))}
              <button className="repeatable-add" type="button"
                onClick={() => update({ additionalCrew: [...meta.additionalCrew, blankCrew()] })}>
                + Add contact
              </button>
            </div>
          </div>

          {/* Dietary restrictions */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Dietary Restrictions</div>
            <div className="repeatable-list">
              {meta.dietaryRestrictions.map((d, i) => (
                <RepeatableRow
                  key={i}
                  onRemove={() => update({ dietaryRestrictions: meta.dietaryRestrictions.filter((_, j) => j !== i) })}
                  columns="1fr 1fr"
                >
                  <input className="sheet-input" placeholder="Name" value={d.name}
                    onChange={(e) => update({ dietaryRestrictions: meta.dietaryRestrictions.map((r, j) => j === i ? { ...r, name: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Notes" value={d.notes}
                    onChange={(e) => update({ dietaryRestrictions: meta.dietaryRestrictions.map((r, j) => j === i ? { ...r, notes: e.target.value } : r) })} />
                </RepeatableRow>
              ))}
              <button className="repeatable-add" type="button"
                onClick={() => update({ dietaryRestrictions: [...meta.dietaryRestrictions, blankDietary()] })}>
                + Add restriction
              </button>
            </div>
          </div>

        </div>

        {/* ── Preview panel ── */}
        <div className="sheet-preview-panel">
          <div className="sheet-doc">
            {scheduleMeta && (
              <SheetPreviewHeader type="CONTACT SHEET" meta={scheduleMeta} />
            )}

            <div className="sheet-doc-body">

              {/* Distribution list */}
              {meta.distributionList.length > 0 && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Distribution</div>
                  <table className="sheet-doc-table">
                    <thead>
                      <tr><th>Name</th><th>Email</th></tr>
                    </thead>
                    <tbody>
                      {meta.distributionList.map((c, i) => (
                        <tr key={i}>
                          <td>{c.name}</td>
                          <td>{c.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Client reps */}
              {meta.clientReps.length > 0 && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Client Representatives</div>
                  <table className="sheet-doc-table">
                    <thead>
                      <tr><th>Name</th><th>Title</th><th>Phone</th><th>Email</th></tr>
                    </thead>
                    <tbody>
                      {meta.clientReps.map((c, i) => (
                        <tr key={i}>
                          <td>{c.name}</td>
                          <td>{c.title}</td>
                          <td>{c.phone}</td>
                          <td>{c.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Emergency contact */}
              {meta.emergencyContact.name && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Emergency Contact</div>
                  <div className="sheet-doc-summary">
                    <div className="sheet-doc-summary-name">{meta.emergencyContact.name}</div>
                    {meta.emergencyContact.phone && (
                      <div className="sheet-doc-summary-detail">{meta.emergencyContact.phone}</div>
                    )}
                    {meta.emergencyContact.backupPhone && (
                      <div className="sheet-doc-summary-detail">Backup: {meta.emergencyContact.backupPhone}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Additional crew */}
              {meta.additionalCrew.length > 0 && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Additional Crew / Contacts</div>
                  <table className="sheet-doc-table">
                    <thead>
                      <tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr>
                    </thead>
                    <tbody>
                      {meta.additionalCrew.map((c, i) => (
                        <tr key={i}>
                          <td>{c.name}</td>
                          <td>{c.role}</td>
                          <td>{c.phone}</td>
                          <td>{c.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Dietary */}
              {meta.dietaryRestrictions.length > 0 && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Dietary Restrictions</div>
                  <table className="sheet-doc-table">
                    <thead>
                      <tr><th>Name</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                      {meta.dietaryRestrictions.map((d, i) => (
                        <tr key={i}>
                          <td>{d.name}</td>
                          <td>{d.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Call sheet link */}
              <div className="sheet-doc-section">
                <div className="sheet-doc-section-title">Links</div>
                <div className="sheet-doc-location">
                  <div className="sheet-doc-location-detail">
                    <a className="sheet-doc-location-link" href={contactSheetUrl} target="_blank" rel="noreferrer">
                      Contact Sheet (public link)
                    </a>
                  </div>
                  <div className="sheet-doc-location-detail">
                    <a className="sheet-doc-location-link" href={callSheetUrl} target="_blank" rel="noreferrer">
                      Call Sheet (public link)
                    </a>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {showSend && (
        <SendModal
          distributionList={meta.distributionList}
          scheduleName={name}
          scheduleDate={scheduleMeta?.date ?? ''}
          contactSheetUrl={contactSheetUrl}
          callSheetUrl={callSheetUrl}
          editorToken={token}
          onClose={() => setShowSend(false)}
        />
      )}
    </div>
  );
}
