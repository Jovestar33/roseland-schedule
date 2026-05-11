export async function getViewLink(name: string, editorToken: string): Promise<string> {
  const params = new URLSearchParams({ name, editorToken });
  const res = await fetch(`/.netlify/functions/view-link?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'Could not generate view link');
  }
  const data = await res.json() as { viewToken: string };
  return `${window.location.origin}/view?v=${encodeURIComponent(name)}&vt=${encodeURIComponent(data.viewToken)}`;
}
