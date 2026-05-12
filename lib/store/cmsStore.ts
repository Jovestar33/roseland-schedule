import { create } from 'zustand';
import { loadCmsConfig, type CmsConfig, type CmsAction } from '../api/cms';
import { ACTIONS, ACTION_CLASS_MAP, CMS_ACTION_STYLES } from '../constants';

export interface CmsStore {
  config: CmsConfig;
  loaded: boolean;
  modalOpen: boolean;

  loadConfig: () => Promise<void>;
  setConfig: (config: CmsConfig) => void;
  applyConfig: (config: CmsConfig) => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useCmsStore = create<CmsStore>((set, get) => ({
  config: {},
  loaded: false,
  modalOpen: false,

  async loadConfig() {
    try {
      const config = await loadCmsConfig();
      set({ config, loaded: true });
      get().applyConfig(config);
    } catch {
      set({ loaded: true });
    }
  },

  setConfig(config) {
    set({ config });
    get().applyConfig(config);
  },

  applyConfig(config) {
    if (typeof document === 'undefined') return;

    // Apply CSS custom properties
    if (config.colors) {
      const root = document.documentElement;
      Object.entries(config.colors).forEach(([k, v]) => {
        if (v) root.style.setProperty(k, v);
      });
    }

    // Apply action styles as an injected <style> block
    const styles = config.actionStyles || {};
    const css = CMS_ACTION_STYLES.map(({ cls, defBg, defText }) => {
      const s = styles[cls] || {};
      const bg = s.bg || defBg;
      const text = s.text || defText;
      return `.${cls}{background:${bg}!important;color:${text}!important;}`;
    }).join('\n');

    let el = document.getElementById('cms-action-styles') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'cms-action-styles';
      document.head.appendChild(el);
    }
    if (Object.keys(styles).length > 0) {
      el.textContent = css;
    }
  },

  openModal() { set({ modalOpen: true }); },
  closeModal() { set({ modalOpen: false }); },
}));

// Derived selectors — used by ActionCell and ScheduleRow

export function useCmsActions(): readonly string[] {
  const actions = useCmsStore(s => s.config.actions);
  if (actions?.length) {
    return ['', ...actions.map((a: CmsAction) => a.name), 'Other'];
  }
  return ACTIONS;
}

export function useCmsLabel(key: string, def: string): string {
  const labels = useCmsStore(s => s.config.labels) as Record<string, string> | undefined;
  return labels?.[key] || def;
}

export function useCmsActionClassMap(): Record<string, string> {
  const actions = useCmsStore(s => s.config.actions);
  if (!actions?.length) return ACTION_CLASS_MAP;
  const map: Record<string, string> = { ...ACTION_CLASS_MAP };
  actions.forEach((a: CmsAction) => { if (a.color) map[a.name] = a.color; });
  return map;
}
