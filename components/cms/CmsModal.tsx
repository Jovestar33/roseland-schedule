'use client';
import { useState, useRef } from 'react';
import { useCmsStore } from '@/lib/store/cmsStore';
import { verifyCmsPin, saveCmsConfig, type CmsConfig, type CmsAction } from '@/lib/api/cms';
import { CMS_COLORS, CMS_ACTION_STYLES, ACTIONS, ACTION_CLASS_MAP } from '@/lib/constants';

const ACTION_COLOR_OPTS = [
  { val: '',          label: '— none —' },
  { val: 'aShoot',    label: 'Shoot (pink)' },
  { val: 'aLunch',    label: 'Lunch (yellow)' },
  { val: 'aDinner',   label: 'Dinner (rose)' },
  { val: 'aWrap',     label: 'Wrap (green)' },
  { val: 'aDayOff',   label: 'Day Off (mint)' },
  { val: 'aDrive',    label: 'Drive (blue)' },
  { val: 'aMove',     label: 'Move (purple)' },
  { val: 'aCrewCall', label: 'Crew Call (orange)' },
  { val: 'aBreakfast',label: 'Breakfast (cream)' },
  { val: 'aBreak',    label: 'Break (sage)' },
  { val: 'aSetup',    label: 'Set Up (lavender)' },
  { val: 'aOther',    label: 'Other (slate)' },
];

const CMS_LABELS_DEF = [
  { key: 'appTitle',    label: 'Page title',           def: 'Production Schedule' },
  { key: 'hdrTitle',    label: 'Header subtitle',       def: 'Production Schedule' },
  { key: 'colAction',   label: 'Column: Action',        def: 'Action' },
  { key: 'colLocation', label: 'Column: Location',      def: 'Location' },
  { key: 'colDesc',     label: 'Column: Description',   def: 'Description' },
  { key: 'colNotes',    label: 'Column: Notes',         def: 'Notes' },
  { key: 'colTimeIn',   label: 'Column: Time In',       def: 'Time In' },
  { key: 'colDuration', label: 'Column: Duration',      def: 'Duration' },
  { key: 'colTimeOut',  label: 'Column: Time Out',      def: 'Time Out' },
  { key: 'colDone',     label: 'Column: Done',          def: 'Done' },
  { key: 'metaTown',    label: 'Meta: Town / Location', def: 'Town / Location' },
  { key: 'metaDate',    label: 'Meta: Date',            def: 'Date' },
  { key: 'metaCall',    label: 'Meta: Call Time',       def: 'Call Time' },
  { key: 'metaProd',    label: 'Meta: Producer',        def: 'Producer' },
  { key: 'metaDir',     label: 'Meta: Director',        def: 'Director' },
  { key: 'metaDp',      label: 'Meta: Camera',          def: 'Camera' },
  { key: 'btnAddRow',   label: 'Button: Add Row',       def: '+ Add Row' },
];

type Tab = 'actions' | 'colors' | 'logo' | 'labels';

function initActions(cfg: CmsConfig): CmsAction[] {
  if (cfg.actions?.length) return cfg.actions.map(a => ({ ...a }));
  return ACTIONS.filter(a => a && a !== 'Other' && !a.includes('Sunrise') && !a.includes('Sunset'))
    .map(a => ({ name: a, color: ACTION_CLASS_MAP[a] || '' }));
}

function initActionStyles(cfg: CmsConfig): Record<string, { bg: string; text: string }> {
  const out: Record<string, { bg: string; text: string }> = {};
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  CMS_ACTION_STYLES.forEach(({ cls, defBg, defText }) => {
    const saved = cfg.actionStyles?.[cls] ?? {} as { bg?: string; text?: string };
    out[cls] = {
      bg:   saved.bg   || (root ? root.getPropertyValue('--' + cls + '-bg').trim() : '') || defBg,
      text: saved.text || (root ? root.getPropertyValue('--' + cls + '-text').trim() : '') || defText,
    };
  });
  return out;
}

function initColors(cfg: CmsConfig): Record<string, string> {
  const out: Record<string, string> = {};
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  CMS_COLORS.forEach(({ key, def }) => {
    out[key] = cfg.colors?.[key] || (root ? root.getPropertyValue(key).trim() : '') || def;
  });
  return out;
}

// ── Color picker row ──────────────────────────────────────────────────────────
function ColorPicker({
  label, bg, text, defBg, defText,
  onBg, onText,
}: {
  label: string;
  bg: string;
  text?: string;
  defBg: string;
  defText?: string;
  onBg: (v: string) => void;
  onText?: (v: string) => void;
}) {
  function swatch(val: string, def: string, onChange: (v: string) => void) {
    return (
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <input type="color" value={val || def}
          style={{ width: 32, height: 28, padding: 1, border: '1.5px solid var(--g200)', borderRadius: 5, cursor: 'pointer' }}
          onChange={e => onChange(e.target.value)} />
        <input type="text" className="lbl-inp"
          style={{ fontFamily: 'monospace', fontSize: 12, width: 80, padding: '4px 6px' }}
          value={val || def} maxLength={7}
          onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value); }} />
        <button className="btn btn-light btn-sm" style={{ padding: '3px 7px' }}
          onClick={() => onChange(def)} title={`Reset to ${def}`}>↺</button>
      </div>
    );
  }

  return (
    <div className="lbl-row">
      <div className="lbl-key">{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {onText ? <span style={{ fontSize: 10, color: 'var(--g400)', whiteSpace: 'nowrap' }}>BG</span> : null}
        {swatch(bg, defBg, onBg)}
        {onText && defText !== undefined && (
          <>
            <span style={{ fontSize: 10, color: 'var(--g400)', whiteSpace: 'nowrap' }}>Text</span>
            {swatch(text || defText, defText, onText)}
          </>
        )}
      </div>
    </div>
  );
}

export default function CmsModal() {
  const closeModal = useCmsStore(s => s.closeModal);
  const setConfig  = useCmsStore(s => s.setConfig);
  const currentCfg = useCmsStore(s => s.config);

  // ── PIN gate ───────────────────────────────────────────────────────────────
  const [pin, setPin]           = useState('');
  const [pinError, setPinError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const verifiedPin = useRef('');

  async function handlePinSubmit() {
    if (!pin) return;
    setVerifying(true); setPinError('');
    const ok = await verifyCmsPin(pin);
    setVerifying(false);
    if (ok) { verifiedPin.current = pin; setVerified(true); }
    else setPinError('Invalid passcode — try again.');
  }

  // ── Working state (only initialized when verified) ──────────────────────
  const [tab, setTab]             = useState<Tab>('actions');
  const [actions, setActions]     = useState<CmsAction[]>(() => initActions(currentCfg));
  const [actionStyles, setAS]     = useState(() => initActionStyles(currentCfg));
  const [colors, setColors]       = useState(() => initColors(currentCfg));
  const [labels, setLabels]       = useState<Record<string, string>>(() => ({ ...currentCfg.labels }));
  const [logo, setLogo]           = useState<string | null>(currentCfg.logo ?? null);
  const [newActionName, setNAName] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── Drag-reorder for actions tab ──────────────────────────────────────────
  const dragSrc = useRef<number | null>(null);

  function handleDragStart(i: number) { dragSrc.current = i; }
  function handleDrop(i: number) {
    const src = dragSrc.current;
    if (src === null || src === i) return;
    const next = [...actions];
    const [moved] = next.splice(src, 1);
    next.splice(src < i ? i - 1 : i, 0, moved);
    setActions(next);
    dragSrc.current = null;
  }

  // ── Preview colors/styles live ────────────────────────────────────────────
  function previewColors(c: typeof colors) {
    const root = document.documentElement;
    Object.entries(c).forEach(([k, v]) => { if (v) root.style.setProperty(k, v); });
  }
  function previewActionStyles(s: typeof actionStyles) {
    const css = CMS_ACTION_STYLES.map(({ cls, defBg, defText }) => {
      const v = s[cls] || {};
      return `.${cls}{background:${v.bg || defBg}!important;color:${v.text || defText}!important;}`;
    }).join('\n');
    let el = document.getElementById('cms-action-styles') as HTMLStyleElement | null;
    if (!el) { el = document.createElement('style'); el.id = 'cms-action-styles'; document.head.appendChild(el); }
    el.textContent = css;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveError('');
    const cfg: CmsConfig = {
      actions,
      actionStyles,
      colors,
      labels,
      logo,
    };
    try {
      await saveCmsConfig(cfg, verifiedPin.current);
      setConfig(cfg);
      closeModal();
    } catch (e) {
      setSaveError((e as Error).message || 'Save failed');
      setSaving(false);
    }
  }

  // ── Logo upload ───────────────────────────────────────────────────────────
  function handleLogoFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setLogo(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  // ── PIN gate view ─────────────────────────────────────────────────────────
  if (!verified) {
    return (
      <div className="overlay active" style={{ display: 'flex' }}
        onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal" style={{ maxWidth: 380 }}>
          <div className="mhdr" style={{ padding: '18px 22px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>⚙ Content Manager</div>
            <button className="mclose" onClick={closeModal}>✕</button>
          </div>
          <div className="mbody">
            <p style={{ fontSize: 13, color: 'var(--g400)', marginBottom: 20 }}>
              Enter the CMS passcode to change branding, labels, and action settings.
            </p>
            <input
              type="password"
              className="lbl-inp"
              style={{ width: '100%', marginBottom: 8 }}
              placeholder="CMS passcode"
              value={pin}
              autoFocus
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
            />
            {pinError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{pinError}</div>}
          </div>
          <div className="mfoot">
            <button className="btn btn-light" onClick={closeModal}>Cancel</button>
            <button className="btn btn-pink" onClick={handlePinSubmit} disabled={verifying}>
              {verifying ? 'Checking…' : 'Enter'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main CMS editor ───────────────────────────────────────────────────────
  return (
    <div className="overlay active" style={{ display: 'flex' }}
      onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal" style={{ maxWidth: 760, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="mhdr" style={{ padding: '14px 22px 12px', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>⚙ Content Manager</div>
          <button className="mclose" onClick={closeModal}>✕</button>
        </div>

        {/* Tabs */}
        <div className="cms-tabs" style={{ padding: '0 22px', flexShrink: 0 }}>
          {(['actions', 'colors', 'logo', 'labels'] as Tab[]).map(t => (
            <button key={t} className={`cms-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'actions' ? '▶ Actions' : t === 'colors' ? '🎨 Colors' : t === 'logo' ? '🖼 Logo' : '👁 Labels'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="mbody" style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── Actions tab ── */}
          {tab === 'actions' && (
            <>
              <p className="cms-tip">Drag to reorder · rename · choose a highlight color · &ldquo;Other&rdquo; is always appended automatically.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                {actions.map((ac, i) => (
                  <div key={i} className="ac-row" draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => handleDrop(i)}>
                    <span className="ac-drag">☰</span>
                    <input
                      type="text"
                      className="ac-name-inp"
                      value={ac.name}
                      placeholder="Action name…"
                      onChange={e => setActions(prev => prev.map((a, j) => j === i ? { ...a, name: e.target.value } : a))}
                    />
                    <select
                      className="ac-color-sel"
                      value={ac.color}
                      onChange={e => setActions(prev => prev.map((a, j) => j === i ? { ...a, color: e.target.value } : a))}
                    >
                      {ACTION_COLOR_OPTS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                    </select>
                    <button className="ac-del-btn" title="Remove"
                      onClick={() => setActions(prev => prev.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
              </div>
              <div className="ac-add-row">
                <input
                  type="text"
                  className="ac-add-inp"
                  placeholder="New action name…"
                  value={newActionName}
                  onChange={e => setNAName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    const name = newActionName.trim();
                    if (!name || actions.some(a => a.name === name)) return;
                    setActions(prev => [...prev, { name, color: '' }]);
                    setNAName('');
                  }}
                />
                <button className="btn btn-pink btn-sm" onClick={() => {
                  const name = newActionName.trim();
                  if (!name || actions.some(a => a.name === name)) return;
                  setActions(prev => [...prev, { name, color: '' }]);
                  setNAName('');
                }}>+ Add</button>
              </div>
            </>
          )}

          {/* ── Colors tab ── */}
          {tab === 'colors' && (
            <>
              <p className="cms-tip">Changes preview live. Hit Save to push to all users.</p>
              <div className="cms-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>Brand palette</div>
              <div className="lbl-grid" style={{ marginBottom: 20 }}>
                {CMS_COLORS.map(({ key, def }) => (
                  <ColorPicker
                    key={key}
                    label={key.replace('--', '').replace(/-/g, ' ')}
                    bg={colors[key] || def}
                    defBg={def}
                    onBg={v => {
                      const next = { ...colors, [key]: v };
                      setColors(next);
                      previewColors(next);
                    }}
                  />
                ))}
              </div>
              <div className="cms-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>Action row colors</div>
              <div className="lbl-grid">
                {CMS_ACTION_STYLES.map(({ cls, defBg, defText }) => (
                  <ColorPicker
                    key={cls}
                    label={cls.replace('a', '').replace(/([A-Z])/g, ' $1').trim()}
                    bg={actionStyles[cls]?.bg || defBg}
                    text={actionStyles[cls]?.text || defText}
                    defBg={defBg}
                    defText={defText}
                    onBg={v => {
                      const next = { ...actionStyles, [cls]: { ...actionStyles[cls], bg: v } };
                      setAS(next);
                      previewActionStyles(next);
                    }}
                    onText={v => {
                      const next = { ...actionStyles, [cls]: { ...actionStyles[cls], text: v } };
                      setAS(next);
                      previewActionStyles(next);
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── Logo tab ── */}
          {tab === 'logo' && (
            <>
              <p className="cms-tip">Upload a PNG, SVG, JPEG, or WebP. Recommended height: 120–160 px.</p>
              {logo && (
                <div style={{ marginBottom: 14 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="Logo preview" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--g200)' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="btn btn-light btn-sm" style={{ cursor: 'pointer' }}>
                  📁 Choose file
                  <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={e => handleLogoFile(e.target.files?.[0] ?? null)} />
                </label>
                {logo && (
                  <button className="btn btn-light btn-sm" onClick={() => setLogo(null)}>↺ Remove Logo</button>
                )}
              </div>
            </>
          )}

          {/* ── Labels tab ── */}
          {tab === 'labels' && (
            <>
              <p className="cms-tip">Customize text throughout the app. Leave blank to keep the default.</p>
              <div className="lbl-grid">
                {CMS_LABELS_DEF.map(({ key, label, def }) => (
                  <div key={key} className="lbl-row">
                    <div className="lbl-key">{label}</div>
                    <input
                      type="text"
                      className="lbl-inp"
                      placeholder={def}
                      value={labels[key] ?? ''}
                      onChange={e => setLabels(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mfoot" style={{ flexShrink: 0 }}>
          {saveError && <span style={{ color: '#ef4444', fontSize: 12 }}>{saveError}</span>}
          <button className="btn btn-light" onClick={closeModal}>Cancel</button>
          <button className="btn btn-pink" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
