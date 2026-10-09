export type Theme = 'light' | 'dark' | 'system';

export function getTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored && ['light', 'dark', 'system'].includes(stored)) {
    return stored;
  }
  return 'system';
}

export function setTheme(theme: Theme) {
  localStorage.setItem('theme', theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function initTheme() {
  const theme = getTheme();
  applyTheme(theme);
}
