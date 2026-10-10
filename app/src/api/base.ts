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
