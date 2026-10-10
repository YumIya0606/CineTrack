/**
 * Accent themes. Every gold utility in the app resolves to the `--color-gold*`
 * CSS custom properties, so swapping those four variables at runtime re-themes
 * the whole UI — buttons, the logo mark, the active tab pill, focus rings, and
 * the loading screen included.
 *
 * `glow` is the rgb triplet used by --shadow-glow so the focus halo matches.
 */
export interface Accent {
  id: string
  label: string
  gold: string
  goldSoft: string
  goldDim: string
  /** rgb triplet, e.g. "245, 181, 68" */
  glow: string
}

export const ACCENTS: Accent[] = [
  {
    id: 'gold',
    label: 'Marquee Gold',
    gold: '#f5b544',
    goldSoft: '#f8c97d',
    goldDim: '#8a6420',
    glow: '245, 181, 68'
  },
  {
    id: 'emerald',
    label: 'Emerald',
    gold: '#3ecf8e',
    goldSoft: '#7ee2b6',
    goldDim: '#1f6b4a',
    glow: '62, 207, 142'
  },
  {
    id: 'azure',
    label: 'Azure',
    gold: '#5b8def',
    goldSoft: '#9cb8f6',
    goldDim: '#2f4f8f',
    glow: '91, 141, 239'
  },
  {
    id: 'crimson',
    label: 'Crimson',
    gold: '#e84855',
    goldSoft: '#f4818c',
    goldDim: '#8f2b33',
    glow: '232, 72, 85'
  },
  {
    id: 'violet',
    label: 'Violet',
    gold: '#a78bfa',
    goldSoft: '#c4b5fd',
    goldDim: '#5b3fa8',
    glow: '167, 139, 250'
  }
]

export const DEFAULT_ACCENT = ACCENTS[0]!

/** Applies an accent by rewriting the theme custom properties on :root. */
export function applyAccent(id: string | null | undefined): void {
  const accent = ACCENTS.find(a => a.id === id) ?? DEFAULT_ACCENT
  const root = document.documentElement
  root.style.setProperty('--color-gold', accent.gold)
  root.style.setProperty('--color-gold-soft', accent.goldSoft)
  root.style.setProperty('--color-gold-dim', accent.goldDim)
  root.style.setProperty('--shadow-glow', `0 0 24px -6px rgba(${accent.glow}, 0.35)`)
}

/**
 * Compact density. Toggling a class on the root element lets a global CSS
 * block shrink posters, rows, and section rhythm for large libraries.
 */
export type Density = 'comfortable' | 'compact'

export function applyDensity(density: Density | null | undefined): void {
  const root = document.documentElement
  root.classList.toggle('density-compact', density === 'compact')
}
