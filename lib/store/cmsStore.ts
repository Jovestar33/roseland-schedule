import { create } from 'zustand';
import { loadCmsConfig, type CmsConfig, type CmsAction } from '../api/cms';
import { ACTIONS, ACTION_CLASS_MAP, CMS_ACTION_STYLES, CMS_COLORS } from '../constants';

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

let configRequest = 0;

export const useCmsStore = create<CmsStore>((set, get) => ({
  config: {},
  loaded: false,
  modalOpen: false,

  async loadConfig() {
    const request = ++configRequest;
    try {
      const config = await loadCmsConfig();
      if (request !== configRequest) return;
      set({ config, loaded: true });
      get().applyConfig(config);
    } catch {
      set({ loaded: true });
    }
  },

  setConfig(config) {
    configRequest++;
    set({ config });
    get().applyConfig(config);
  },

  applyConfig(config) {
    if (typeof document === 'undefined') return;

    // Clear absent settings so a previous organization cannot color this one.
    CMS_COLORS.forEach(({key}) => document.documentElement.style.removeProperty(key));
    if (config.colors) Object.entries(config.colors).forEach(([key,value]) => {
      if (value) document.documentElement.style.setProperty(key,value);
    });

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
    el.textContent = Object.keys(styles).length > 0 ? css : "";
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
  actions.forEach((a: CmsAction) => { map[a.name] = a.color; });
  return map;
}
