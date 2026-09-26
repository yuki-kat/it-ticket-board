export const SCREEN_PATTERNS = [
  { id: 'plain', label: 'Plain', detail: 'A clean solid workspace' },
  { id: 'dots', label: 'Dot grid', detail: 'A subtle planning grid' },
  { id: 'lines', label: 'Fine lines', detail: 'A quiet lined workspace' },
  { id: 'blueprint', label: 'Blueprint', detail: 'A structured operations backdrop' },
] as const
export type ScreenPattern = typeof SCREEN_PATTERNS[number]['id']

const SCREEN_PATTERN_KEY = 'it-ticket-kanban-screen-pattern-v1'

export function loadScreenPattern(): ScreenPattern {
  try {
    const saved = localStorage.getItem(SCREEN_PATTERN_KEY)
    return SCREEN_PATTERNS.find((pattern) => pattern.id === saved)?.id ?? 'plain'
  } catch { return 'plain' }
}

/** Puts the pattern on the page (the styles in screen-pattern.css look for it) and remembers it. */
export function applyScreenPattern(pattern: ScreenPattern) {
  document.documentElement.dataset.screenPattern = pattern
  try { localStorage.setItem(SCREEN_PATTERN_KEY, pattern) } catch { /* the pattern just won't be remembered */ }
}
