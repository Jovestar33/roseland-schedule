'use client';
import { useState } from 'react';
import AutoResizeTextarea from './AutoResizeTextarea';
import styles from './key-instruction.module.css';

export default function KeyInstruction({ value = '', onChange, onFocus }: { value?: string; onChange: (value: string) => void; onFocus: () => void }) {
  const [adding, setAdding] = useState(false);
  return <div className={styles.field}>
    {value || adding ? <><span className={styles.label}>Highlighted instruction</span><AutoResizeTextarea className="ci-ta" label="Highlighted instruction" value={value} onChange={onChange} onFocus={onFocus} placeholder="Safety, access, or client instruction…" rows={1} collapsible={false} />
      {value && <div className={`print-field-text ${styles.printKey}`}>Key instruction: {value}</div>}</> : <button className={styles.add} type="button" onClick={() => setAdding(true)}>+ Key instruction</button>}
  </div>;
}
