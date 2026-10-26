// Light / dark / follow-the-system, applied as data-theme on <html>.
// Only the tool follows this: generated screens always render in their own (light) theme.
export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'uxs-theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  save(pref)
}

/**
 * Switches theme with a soft circular reveal from the clicked control (View Transitions API).
 * Falls back to a colour crossfade, and to an instant switch for reduced motion.
 */
export function switchTheme(pref: ThemePref, from?: { x: number; y: number }) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  const current = document.documentElement.getAttribute('data-theme') === 'dark'
  if (dark === current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return applyTheme(pref)
  const root = document.documentElement
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
  if (!doc.startViewTransition) {
    root.classList.add('theme-fade')
    applyTheme(pref)
    setTimeout(() => root.classList.remove('theme-fade'), 500)
    return
  }
  const x = from?.x ?? innerWidth - 60
  const y = from?.y ?? 24
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  root.style.setProperty('--vt-r', `${r}px`)
  doc.startViewTransition(() => applyTheme(pref))
}

function save(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/** Keeps "system" in sync when the OS switches between light and dark. */
export function watchSystemTheme(get: () => ThemePref): () => void {
  const m = media()
  const on = () => get() === 'system' && applyTheme('system')
  m.addEventListener('change', on)
  return () => m.removeEventListener('change', on)
}
