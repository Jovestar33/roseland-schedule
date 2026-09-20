'use client';
import styles from './hub-order.module.css';
export default function HubOrderButtons({ name, up, down, onMove }: { name: string; up: boolean; down: boolean; onMove: (direction: -1 | 1) => void }) {
  return <span className={styles.controls} role="group" aria-label={`Position of ${name}`}>
    <button type="button" disabled={!up} aria-label={`Move ${name} up`} title="Move production up" onClick={event => { event.preventDefault(); event.stopPropagation(); onMove(-1); }}>↑</button>
    <button type="button" disabled={!down} aria-label={`Move ${name} down`} title="Move production down" onClick={event => { event.preventDefault(); event.stopPropagation(); onMove(1); }}>↓</button>
  </span>;
}
