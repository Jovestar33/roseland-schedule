'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/store/authStore';
import {
  loadCallSheetData, saveCallSheetData, defaultCallSheetData,
  loadSheetMeta, defaultSheetMeta, lookupHospital,
} from '@/lib/api/sheets';
import { postLoad } from '@/lib/api/load';
import type {
  CallSheetData, SheetMeta, ScheduleData,
  StaggeredCall, CastCall, CrewCall, CondensedDayItem, DepartmentNote,
} from '@/lib/types';
import SheetPreviewHeader from './SheetPreviewHeader';
import RepeatableRow from './RepeatableRow';
import SendModal from './SendModal';

interface Props {
  name: string;
}

function blankStaggered(): StaggeredCall { return { name: '', role: '', callTime: '' }; }
function blankCast(): CastCall { return { name: '', role: '', callTime: '', status: '' }; }
function blankCrew(): CrewCall { return { department: '', name: '', callTime: '', walkieChannel: '' }; }
function blankDayItem(): CondensedDayItem { return { time: '', note: '' }; }
function blankDeptNote(): DepartmentNote { return { department: '', note: '' }; }

export default function CallSheetEditor({ name }: Props) {
  const token = useAuthStore((s) => s.token) ?? '';

  const [data, setData] = useState<CallSheetData>(defaultCallSheetData());
  const [sheetMeta, setSheetMeta] = useState<SheetMeta>(defaultSheetMeta());
  const [schedData, setSchedData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [hospitalLooking, setHospitalLooking] = useState(false);
  const [showSend, setShowSend] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      loadCallSheetData(name, token),
      loadSheetMeta(name, token),
      postLoad(name, token),
    ]).then(([cd, sm, sd]) => {
      setData(cd);
      setSheetMeta(sm);
      setSchedData(sd);
    }).catch(console.error).finally(() => setLoading(false));
  }, [name, token]);

  const save = useCallback(async (updated: CallSheetData) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveCallSheetData(name, updated, token);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  }, [name, token]);

  function update(patch: Partial<CallSheetData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  async function handleHospitalLookup() {
    const town = schedData?.meta?.town ?? '';
    if (!town) return;
    setHospitalLooking(true);
    try {
      const result = await lookupHospital(town, '', token);
      if (result) {
        update({ hospital: result });
      }
    } catch { /* ignore */ }
    setHospitalLooking(false);
  }

  function toggleCondensedDay() {
    if (data.condensedDayOverride) {
      update({ condensedDayOverride: null });
    } else {
      update({ condensedDayOverride: [blankDayItem()] });
    }
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
        <div className="sheet-actionbar-title">Call Sheet — {name}</div>
        <div className="sheet-actionbar-btns">
          <button
            className="btn btn-light btn-sm"
            onClick={() => window.open(callSheetUrl, '_blank')}
          >
            View Public Link
          </button>
          <button className="btn btn-light btn-sm" onClick={() => setShowSend(true)}>
            ✉ Send
          </button>
          <button
            className="btn btn-pink btn-sm"
            disabled={saving}
            onClick={() => save(data)}
          >
            {saving ? 'Saving…' : saveMsg ?? 'Save'}
          </button>
        </div>
      </div>

      <div className="sheet-layout">
        {/* ── Edit panel ── */}
        <div className="sheet-edit-panel">

          {/* Hospital / nearest ER */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">
              Nearest Hospital / ER
              {schedData?.meta?.town && (
                <button
                  className="btn btn-light btn-sm"
                  style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px' }}
                  onClick={handleHospitalLookup}
                  disabled={hospitalLooking}
                  type="button"
                >
                  {hospitalLooking ? 'Looking up…' : 'Auto-fill'}
                </button>
              )}
            </div>
            <div className="sheet-field-row--1 sheet-field-row">
              <div className="sheet-field">
                <label>Hospital Name</label>
                <input className="sheet-input" value={data.hospital.name}
                  onChange={(e) => update({ hospital: { ...data.hospital, name: e.target.value } })} />
              </div>
            </div>
            <div className="sheet-field-row">
              <div className="sheet-field">
                <label>Address</label>
                <input className="sheet-input" value={data.hospital.address}
                  onChange={(e) => update({ hospital: { ...data.hospital, address: e.target.value } })} />
              </div>
              <div className="sheet-field">
                <label>Phone</label>
                <input className="sheet-input" value={data.hospital.phone}
                  onChange={(e) => update({ hospital: { ...data.hospital, phone: e.target.value } })} />
              </div>
            </div>
          </div>

          {/* Parking */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Parking</div>
            <textarea
              className="sheet-textarea"
              rows={3}
              value={data.parking}
              onChange={(e) => update({ parking: e.target.value })}
              placeholder="Parking instructions, lot number, address…"
            />
          </div>

          {/* Staggered calls */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Staggered Calls</div>
            <div className="repeatable-list">
              {data.staggeredCalls.map((s, i) => (
                <RepeatableRow
                  key={i}
                  onRemove={() => update({ staggeredCalls: data.staggeredCalls.filter((_, j) => j !== i) })}
                  columns="1fr 1fr 80px"
                >
                  <input className="sheet-input" placeholder="Name" value={s.name}
                    onChange={(e) => update({ staggeredCalls: data.staggeredCalls.map((r, j) => j === i ? { ...r, name: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Role" value={s.role}
                    onChange={(e) => update({ staggeredCalls: data.staggeredCalls.map((r, j) => j === i ? { ...r, role: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Time" value={s.callTime}
                    onChange={(e) => update({ staggeredCalls: data.staggeredCalls.map((r, j) => j === i ? { ...r, callTime: e.target.value } : r) })} />
                </RepeatableRow>
              ))}
              <button className="repeatable-add" type="button"
                onClick={() => update({ staggeredCalls: [...data.staggeredCalls, blankStaggered()] })}>
                + Add staggered call
              </button>
            </div>
          </div>

          {/* Cast block */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Cast</div>
            <div className="repeatable-list">
              {data.castBlock.map((c, i) => (
                <RepeatableRow
                  key={i}
                  onRemove={() => update({ castBlock: data.castBlock.filter((_, j) => j !== i) })}
                  columns="1fr 1fr 80px 80px"
                >
                  <input className="sheet-input" placeholder="Name" value={c.name}
                    onChange={(e) => update({ castBlock: data.castBlock.map((r, j) => j === i ? { ...r, name: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Role" value={c.role}
                    onChange={(e) => update({ castBlock: data.castBlock.map((r, j) => j === i ? { ...r, role: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Call" value={c.callTime}
                    onChange={(e) => update({ castBlock: data.castBlock.map((r, j) => j === i ? { ...r, callTime: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Status" value={c.status}
                    onChange={(e) => update({ castBlock: data.castBlock.map((r, j) => j === i ? { ...r, status: e.target.value } : r) })} />
                </RepeatableRow>
              ))}
              <button className="repeatable-add" type="button"
                onClick={() => update({ castBlock: [...data.castBlock, blankCast()] })}>
                + Add cast member
              </button>
            </div>
          </div>

          {/* Crew block */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Crew</div>
            <div className="repeatable-list">
              {data.crewBlock.map((c, i) => (
                <RepeatableRow
                  key={i}
                  onRemove={() => update({ crewBlock: data.crewBlock.filter((_, j) => j !== i) })}
                  columns="1fr 1fr 70px 60px"
                >
                  <input className="sheet-input" placeholder="Department" value={c.department}
                    onChange={(e) => update({ crewBlock: data.crewBlock.map((r, j) => j === i ? { ...r, department: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Name" value={c.name}
                    onChange={(e) => update({ crewBlock: data.crewBlock.map((r, j) => j === i ? { ...r, name: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Call" value={c.callTime}
                    onChange={(e) => update({ crewBlock: data.crewBlock.map((r, j) => j === i ? { ...r, callTime: e.target.value } : r) })} />
                  <input className="sheet-input" placeholder="Ch." value={c.walkieChannel ?? ''}
                    onChange={(e) => update({ crewBlock: data.crewBlock.map((r, j) => j === i ? { ...r, walkieChannel: e.target.value } : r) })} />
                </RepeatableRow>
              ))}
              <button className="repeatable-add" type="button"
                onClick={() => update({ crewBlock: [...data.crewBlock, blankCrew()] })}>
                + Add crew member
              </button>
            </div>
          </div>

          {/* Condensed day */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">
              Condensed Day
              <button
                className="btn btn-light btn-sm"
                style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px' }}
                onClick={toggleCondensedDay}
                type="button"
              >
                {data.condensedDayOverride ? 'Clear override' : 'Override from schedule'}
              </button>
            </div>
            {data.condensedDayOverride ? (
              <div className="repeatable-list">
                {data.condensedDayOverride.map((item, i) => (
                  <RepeatableRow
                    key={i}
                    onRemove={() => update({ condensedDayOverride: (data.condensedDayOverride ?? []).filter((_, j) => j !== i) })}
                    columns="80px 1fr"
                  >
                    <input className="sheet-input sheet-day-override-time" placeholder="Time" value={item.time}
                      onChange={(e) => update({ condensedDayOverride: (data.condensedDayOverride ?? []).map((r, j) => j === i ? { ...r, time: e.target.value } : r) })} />
                    <input className="sheet-input" placeholder="Note" value={item.note}
                      onChange={(e) => update({ condensedDayOverride: (data.condensedDayOverride ?? []).map((r, j) => j === i ? { ...r, note: e.target.value } : r) })} />
                  </RepeatableRow>
                ))}
                <button className="repeatable-add" type="button"
                  onClick={() => update({ condensedDayOverride: [...(data.condensedDayOverride ?? []), blankDayItem()] })}>
                  + Add item
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--g400)', margin: 0 }}>
                Auto-generated from schedule rows. Override to customize.
              </p>
            )}
          </div>

          {/* Advanced schedule text */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Advanced Schedule Notes</div>
            <textarea
              className="sheet-textarea"
              rows={4}
              value={data.advancedSchedule}
              onChange={(e) => update({ advancedSchedule: e.target.value })}
              placeholder="Detailed schedule notes, scene list, etc."
            />
          </div>

          {/* Department notes */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">Department Notes</div>
            <div className="repeatable-list">
              {data.departmentNotes.map((dn, i) => (
                <RepeatableRow
                  key={i}
                  onRemove={() => update({ departmentNotes: data.departmentNotes.filter((_, j) => j !== i) })}
                  columns="1fr"
                >
                  <input className="sheet-input" placeholder="Department" value={dn.department}
                    onChange={(e) => update({ departmentNotes: data.departmentNotes.map((r, j) => j === i ? { ...r, department: e.target.value } : r) })} />
                  <textarea className="sheet-textarea" rows={2} placeholder="Notes" value={dn.note}
                    onChange={(e) => update({ departmentNotes: data.departmentNotes.map((r, j) => j === i ? { ...r, note: e.target.value } : r) })} />
                </RepeatableRow>
              ))}
              <button className="repeatable-add" type="button"
                onClick={() => update({ departmentNotes: [...data.departmentNotes, blankDeptNote()] })}>
                + Add department note
              </button>
            </div>
          </div>

          {/* General notes */}
          <div className="sheet-edit-section">
            <div className="sheet-edit-section-title">General Notes</div>
            <textarea
              className="sheet-textarea"
              rows={4}
              value={data.generalNotes}
              onChange={(e) => update({ generalNotes: e.target.value })}
              placeholder="General notes for the crew…"
            />
          </div>

        </div>

        {/* ── Preview panel ── */}
        <div className="sheet-preview-panel">
          <div className="sheet-doc">
            {scheduleMeta && (
              <SheetPreviewHeader type="CALL SHEET" meta={scheduleMeta} />
            )}

            <div className="sheet-doc-body">

              {/* Hospital */}
              {data.hospital.name && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Nearest Hospital / ER</div>
                  <div className="sheet-doc-location">
                    <div className="sheet-doc-location-name">{data.hospital.name}</div>
                    {data.hospital.address && (
                      <div className="sheet-doc-location-detail">{data.hospital.address}</div>
                    )}
                    {data.hospital.phone && (
                      <div className="sheet-doc-location-detail">{data.hospital.phone}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Parking */}
              {data.parking && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Parking</div>
                  <div style={{ fontSize: 12, color: 'var(--g700)', whiteSpace: 'pre-line' }}>
                    {data.parking}
                  </div>
                </div>
              )}

              {/* Staggered calls */}
              {data.staggeredCalls.length > 0 && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Staggered Calls</div>
                  <table className="sheet-doc-table">
                    <thead>
                      <tr><th>Name</th><th>Role</th><th>Call Time</th></tr>
                    </thead>
                    <tbody>
                      {data.staggeredCalls.map((s, i) => (
                        <tr key={i}>
                          <td>{s.name}</td>
                          <td>{s.role}</td>
                          <td>{s.callTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Cast */}
              {data.castBlock.length > 0 && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Cast</div>
                  <table className="sheet-doc-table">
                    <thead>
                      <tr><th>Name</th><th>Role</th><th>Call</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {data.castBlock.map((c, i) => (
                        <tr key={i}>
                          <td>{c.name}</td>
                          <td>{c.role}</td>
                          <td>{c.callTime}</td>
                          <td>
                            {c.status && (
                              <span className="sheet-status-chip">{c.status}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Crew */}
              {data.crewBlock.length > 0 && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Crew</div>
                  <table className="sheet-doc-table">
                    <thead>
                      <tr><th>Dept</th><th>Name</th><th>Call</th><th>Ch.</th></tr>
                    </thead>
                    <tbody>
                      {data.crewBlock.map((c, i) => (
                        <tr key={i}>
                          <td>{c.department}</td>
                          <td>{c.name}</td>
                          <td>{c.callTime}</td>
                          <td>{c.walkieChannel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Condensed day */}
              {data.condensedDayOverride && data.condensedDayOverride.length > 0 && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Day at a Glance</div>
                  <div className="sheet-doc-day-list">
                    {data.condensedDayOverride.map((item, i) => (
                      <div className="sheet-doc-day-item" key={i}>
                        <span className="sheet-doc-day-time">{item.time}</span>
                        <span className="sheet-doc-day-note">{item.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced schedule */}
              {data.advancedSchedule && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Advanced Schedule</div>
                  <div style={{ fontSize: 12, color: 'var(--g700)', whiteSpace: 'pre-line' }}>
                    {data.advancedSchedule}
                  </div>
                </div>
              )}

              {/* Department notes */}
              {data.departmentNotes.length > 0 && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">Department Notes</div>
                  {data.departmentNotes.map((dn, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      {dn.department && (
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{dn.department}</div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--g700)', whiteSpace: 'pre-line' }}>
                        {dn.note}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* General notes */}
              {data.generalNotes && (
                <div className="sheet-doc-section">
                  <div className="sheet-doc-section-title">General Notes</div>
                  <div style={{ fontSize: 12, color: 'var(--g700)', whiteSpace: 'pre-line' }}>
                    {data.generalNotes}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {showSend && (
        <SendModal
          distributionList={sheetMeta.distributionList}
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
