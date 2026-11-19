import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import HudCorners from './HudCorners'

/**
 * Small destructive-action confirmation. Deliberately not a native
 * `window.confirm` — that blocks the renderer and looks nothing like the app.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onClose
}: {
  open: boolean
  title: string
  body: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="glass-strong relative w-[min(420px,92vw)] overflow-hidden rounded-2xl border border-white/10 p-6 shadow-2xl"
          >
            <HudCorners size={10} />
            <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-soft transition hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="rounded-lg border border-crimson/40 bg-crimson/15 px-4 py-2 text-xs font-semibold text-crimson-soft transition hover:bg-crimson/25"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
