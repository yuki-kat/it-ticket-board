// VITE_API_URL is the backend origin, optionally including /api.
const configuredUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
export const API_BASE = configuredUrl
  ? configuredUrl.endsWith('/api') ? configuredUrl : `${configuredUrl}/api`
  : '/api';

export function authHeader(): Record<string, string> {
  try {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Backend request with the sign-in token. Pass paths without the /api prefix, e.g. '/teams'.
export function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_BASE}${path}`, { ...init, headers: { ...authHeader(), ...(init.headers as Record<string, string> | undefined) } });
}

export async function responseError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    return (JSON.parse(text) as { error?: string }).error || text || `Request failed (${response.status})`;
  } catch {
    return text || `Request failed (${response.status})`;
  }
}
