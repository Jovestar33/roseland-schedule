'use client';
import { useState } from 'react';
import AutoResizeTextarea from './AutoResizeTextarea';
import styles from './key-instruction.module.css';

export default function KeyInstruction({ value = '', onChange, onFocus, onRemoveHighlight }: { value?: string; onChange: (value: string) => void; onFocus: () => void; onRemoveHighlight?: () => void }) {
  const [adding, setAdding] = useState(false);
  return <div className={styles.field}>
    {value || adding ? <><div className={styles.heading}><span className={styles.label}>Highlighted instruction</span><button className={styles.remove} type="button" onClick={() => { if (value && onRemoveHighlight) onRemoveHighlight(); else if (value) { onFocus(); onChange(''); } setAdding(false); }}>{value ? 'Remove highlight' : 'Cancel'}</button></div><AutoResizeTextarea className="ci-ta" label="Highlighted instruction" value={value} onChange={onChange} onFocus={onFocus} placeholder="Safety, access, or client instruction…" rows={1} collapsible={false} />
      {value && <div className={`print-field-text ${styles.printKey}`}>Key instruction: {value}</div>}</> : <button className={styles.add} type="button" onClick={() => setAdding(true)}>+ Key instruction</button>}
  </div>;
}
