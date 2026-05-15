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
  const res = await fetch('/.netlify/functions/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ library: meta, editorToken }),
  });
  if (!res.ok) return meta;
  const body = await res.json() as { library?: LibraryData };
  return body.library ?? meta;
}
