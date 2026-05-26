import type { ProductionIndex } from '@/lib/types';

function defaultIndex(): ProductionIndex {
  return { version: 1, productions: [], days: [], updatedAt: Date.now() };
}

export async function getProductionIndex(editorToken: string): Promise<ProductionIndex> {
  const params = new URLSearchParams({ editorToken, t: String(Date.now()) });
  const res = await fetch(`/.netlify/functions/production?${params}`, { cache: 'no-store' });
  if (!res.ok) return defaultIndex();
  const body = await res.json() as { index?: ProductionIndex };
  return body.index ?? defaultIndex();
}

export async function putProductionIndex(
  index: ProductionIndex,
  editorToken: string,
): Promise<ProductionIndex> {
  const res = await fetch('/.netlify/functions/production', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, editorToken }),
  });
  if (!res.ok) throw new Error(`Production index save failed (HTTP ${res.status})`);
  const body = await res.json() as { index?: ProductionIndex };
  return body.index ?? index;
}
