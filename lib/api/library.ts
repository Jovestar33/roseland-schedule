export interface LibraryFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryData {
  version: number;
  folders: LibraryFolder[];
  scheduleFolderMap: Record<string, string>;
  updatedAt: number;
  // Manual drag order per phase: phaseOrder[prodKey][phaseKey] = [scheduleName, ...]
  phaseOrder?: {
    [productionKey: string]: {
      [phaseKey: string]: string[];
    };
  };
  // Display name overrides stored as [normalizedKey → displayName]
  productionDisplayNames?: { [productionKey: string]: string };
  phaseDisplayNames?: { [productionKey: string]: { [phaseKey: string]: string } };
  // Archive list and cached schedule metadata (written by save.js on every save)
  tsarchived?: string[];
  townCache?: Record<string, string>;
  dateCache?: Record<string, string>;
}

function defaultLibrary(): LibraryData {
  return { version: 1, folders: [], scheduleFolderMap: {}, updatedAt: Date.now() };
}

export async function getLibraryMeta(editorToken: string): Promise<LibraryData> {
  const params = new URLSearchParams({ editorToken, t: String(Date.now()) });
  const res = await fetch(`/.netlify/functions/library?${params}`, { cache: 'no-store' });
  if (!res.ok) return defaultLibrary();
  const body = await res.json() as { library?: LibraryData };
  return body.library ?? defaultLibrary();
}

export async function putLibraryMeta(meta: LibraryData, editorToken: string): Promise<LibraryData> {
  console.log('[putLibraryMeta] sending — phaseOrder keys:', Object.keys(meta.phaseOrder ?? {}),
    'tsarchived count:', (meta.tsarchived ?? []).length,
    'hasToken:', !!editorToken);

  const res = await fetch('/.netlify/functions/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ library: meta, editorToken }),
  });

  console.log('[putLibraryMeta] response status:', res.status);

  if (!res.ok) {
    let errMsg = `Library save failed (HTTP ${res.status})`;
    try {
      const b = await res.json();
      console.error('[putLibraryMeta] error body:', b);
      if (b?.error) errMsg = b.error;
    } catch {}
    throw new Error(errMsg);
  }

  const body = await res.json() as { library?: LibraryData };
  console.log('[putLibraryMeta] success — saved phaseOrder keys:', Object.keys(body.library?.phaseOrder ?? {}));
  return body.library ?? meta;
}
