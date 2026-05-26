'use client';
import { create } from 'zustand';
import { getProductionIndex, putProductionIndex } from '@/lib/api/productions';
import type { Production, ProductionDay, ProductionIndex } from '@/lib/types';
import { useAuthStore } from './authStore';

interface ProductionStore {
  productions: Production[];
  days: ProductionDay[];
  loading: boolean;
  error: string | null;
  loaded: boolean;

  load(): Promise<void>;
  upsertProduction(p: Production): Promise<void>;
  removeProduction(id: string): Promise<void>;
  upsertDay(d: ProductionDay): Promise<void>;
  removeDay(id: string): Promise<void>;
  getDaysFor(productionId: string): ProductionDay[];
  getByProdKey(prodKey: string): Production | undefined;
}

function token(): string | null {
  return useAuthStore.getState().token;
}

async function persist(productions: Production[], days: ProductionDay[]): Promise<void> {
  const t = token();
  if (!t) return;
  const index: ProductionIndex = { version: 1, productions, days, updatedAt: Date.now() };
  await putProductionIndex(index, t);
}

export const useProductionStore = create<ProductionStore>()((set, get) => ({
  productions: [],
  days: [],
  loading: false,
  error: null,
  loaded: false,

  async load() {
    const t = token();
    if (!t) return;
    set({ loading: true, error: null });
    try {
      const index = await getProductionIndex(t);
      set({ productions: index.productions, days: index.days, loading: false, loaded: true });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  async upsertProduction(p: Production) {
    const prods = get().productions;
    const i = prods.findIndex((x) => x.id === p.id);
    const next = i >= 0 ? prods.map((x, j) => (j === i ? p : x)) : [...prods, p];
    set({ productions: next });
    await persist(next, get().days);
  },

  async removeProduction(id: string) {
    const nextP = get().productions.filter((x) => x.id !== id);
    const nextD = get().days.filter((d) => d.productionId !== id);
    set({ productions: nextP, days: nextD });
    await persist(nextP, nextD);
  },

  async upsertDay(d: ProductionDay) {
    const days = get().days;
    const i = days.findIndex((x) => x.id === d.id);
    const next = i >= 0 ? days.map((x, j) => (j === i ? d : x)) : [...days, d];
    set({ days: next });
    await persist(get().productions, next);
  },

  async removeDay(id: string) {
    const next = get().days.filter((x) => x.id !== id);
    set({ days: next });
    await persist(get().productions, next);
  },

  getDaysFor(productionId: string): ProductionDay[] {
    return get()
      .days.filter((d) => d.productionId === productionId)
      .sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date);
        if (a.date) return -1;
        if (b.date) return 1;
        return a.sortOrder - b.sortOrder;
      });
  },

  getByProdKey(prodKey: string): Production | undefined {
    return get().productions.find((p) => p.prodKey === prodKey);
  },
}));
