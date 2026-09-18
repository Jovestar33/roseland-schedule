export const ACCOUNT_IDLE_MS = 60 * 60 * 1000;
export const FICTIONAL_TERMS = 'fictional-terms-v1';
export const FICTIONAL_PRIVACY = 'fictional-privacy-v1';
export type AccountCallback = { type: 'invite' | 'recovery'; tokenHash: string; invitationId: string | null };
export function parseAccountCallback(fragment: string): AccountCallback | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const type = params.get('b08'), tokenHash = params.get('token_hash'), invitationId = params.get('invitation');
  if (!['invite', 'recovery'].includes(type ?? '') || !tokenHash || !/^[a-f0-9]{32,128}$/.test(tokenHash)
    || [...params.keys()].some(key => !['b08', 'token_hash', 'invitation'].includes(key))
    || [...params.keys()].some(key => params.getAll(key).length !== 1)
    || (invitationId !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(invitationId))) return null;
  return { type: type as 'invite' | 'recovery', tokenHash, invitationId };
}

/** Auth storage only. Never reads, migrates or deletes draft/request journals. */
export function accountSessionStorage(namespace: string, stores?: { local: Storage; tab: Storage }) {
  let remember = false;
  const keys = new Set<string>();
  const access = () => stores ?? (typeof window === 'undefined' ? null : { local: window.localStorage, tab: window.sessionStorage });
  const keyFor = (key: string) => `${namespace}:${key}`;
  return {
    setRemember(value: boolean) {
      const storage = access(); remember = value;
      if (!storage) return;
      for (const key of keys) {
        const data = storage.tab.getItem(key) ?? storage.local.getItem(key);
        storage.tab.removeItem(key); storage.local.removeItem(key);
        if (data !== null) (remember ? storage.local : storage.tab).setItem(key, data);
      }
    },
    getItem(key: string) {
      const storage = access(); if (!storage) return null;
      const id = keyFor(key); keys.add(id);
      const tab = storage.tab.getItem(id); if (tab !== null) return tab;
      const local = storage.local.getItem(id); if (local !== null) remember = true;
      return local;
    },
    setItem(key: string, value: string) {
      const storage = access(); if (!storage) return;
      const id = keyFor(key); keys.add(id);
      (remember ? storage.tab : storage.local).removeItem(id);
      (remember ? storage.local : storage.tab).setItem(id, value);
    },
    removeItem(key: string) { const storage = access(); const id = keyFor(key); storage?.local.removeItem(id); storage?.tab.removeItem(id); },
  };
}
