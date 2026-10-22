'use client';
import styles from './schedule-tools.module.css';

export default function ScheduleToolsTabs({active,onTemplates,onRecovery}:{active:'templates'|'recovery';onTemplates:()=>void;onRecovery:()=>void}) {
  return <nav className={styles.tabs} aria-label="Schedule tools">
    <button type="button" aria-current={active==='templates'?'page':undefined} onClick={onTemplates}>Templates</button>
    <button type="button" aria-current={active==='recovery'?'page':undefined} onClick={onRecovery}>Recovery</button>
  </nav>;
}
