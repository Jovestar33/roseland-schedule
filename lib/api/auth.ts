export interface AuthResponse {
  ok: boolean;
  token?: string;
  error?: string;
}

export async function postAuth(password: string): Promise<AuthResponse> {
  try {
    const res = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: body.error ?? 'Server error' };
    }
    return res.json() as Promise<AuthResponse>;
  } catch {
    return { ok: false, error: 'Network error — check your connection' };
  }
}
