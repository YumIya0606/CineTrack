import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUI } from '../store'
import HudCorners from './HudCorners'

const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: 'Navigate',
    rows: [
      { keys: ['1', '7'], label: 'Jump to Home … Stats' },
      { keys: ['S'], label: 'Open Insights' },
      { keys: ['Ctrl', 'K'], label: 'Search the catalog' },
      { keys: ['/'], label: 'Search the catalog' }
    ]
  },
  {
    title: 'Actions',
    rows: [
      { keys: ['B'], label: 'Add watched history in bulk' },
      { keys: [','], label: 'Open Settings' },
      { keys: ['?'], label: 'Show this sheet' },
      { keys: ['Esc'], label: 'Close the open panel' }
    ]
  },
  {
    title: 'In search',
    rows: [
      { keys: ['↑', '↓'], label: 'Move between results' },
      { keys: ['↵'], label: 'Open the selected title' },
      { keys: ['Esc'], label: 'Close search' }
    ]
  }
]

/** The `?` cheat-sheet. Kept separate from Settings so it is one key away. */
export default function ShortcutsOverlay() {
  const open = useUI(s => s.shortcutsOpen)
  const setOpen = useUI(s => s.setShortcutsOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[65] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="glass-strong relative w-[min(720px,94vw)] overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
          >
            <HudCorners />
            <div className="flex items-start justify-between border-b border-line px-6 py-5">
              <div>
                <h2 className="font-display text-xl font-bold text-ink">Keyboard shortcuts</h2>
                <p className="mt-0.5 text-xs text-ink-dim">
                  CineTrack is built to be driven without the mouse.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition hover:border-gold/50 hover:text-gold"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="grid gap-6 p-6 sm:grid-cols-3">
              {GROUPS.map(g => (
                <section key={g.title}>
                  <h3 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">
                    {g.title}
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {g.rows.map(row => (
                      <div
                        key={`${g.title}-${row.label}`}
                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition hover:bg-surface-2/60"
                      >
                        <span className="text-[11.5px] text-ink-soft">{row.label}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {row.keys.map((k, i) => (
                            <span key={`${k}-${i}`} className="flex items-center gap-1">
                              {i > 0 && <span className="text-[9px] text-ink-dim">/</span>}
                              <kbd className="min-w-[20px] rounded border border-line bg-surface px-1.5 py-0.5 text-center text-[10px] font-medium text-ink-soft">
                                {k}
                              </kbd>
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-line px-6 py-3 text-[11px] text-ink-dim">
              <span>Shortcuts are disabled while typing in a field.</span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 font-semibold text-gold transition hover:bg-gold/20"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
