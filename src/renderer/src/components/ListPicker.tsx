import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCollections } from '../store'
import { cn } from '../lib/utils'

interface ListPickerProps {
  containedIn: number[]
  onToggle: (collectionId: number) => void
  onReload: () => void
}

/** Inline shelf picker shown on the detail panel's action row. */
export default function ListPicker({ containedIn, onToggle, onReload }: ListPickerProps) {
  const collections = useCollections(s => s.collections)
  const createCollection = useCollections(s => s.createCollection)
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(o => !o)
          if (!open) onReload()
        }}
        className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:border-gold/40 hover:text-gold"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 4h6l2 2h8v12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        Add to list
        {containedIn.length > 0 && (
          <span className="rounded-full bg-gold/20 px-1.5 text-[9.5px] font-bold text-gold">
            {containedIn.length}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute left-0 top-10 z-30 w-[240px] overflow-hidden rounded-xl border border-white/10 shadow-2xl"
          >
            <div className="border-b border-line px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">
              Your lists
            </div>
            <div className="max-h-[200px] overflow-y-auto p-1.5">
              {collections.length === 0 ? (
                <button
                  onClick={async () => {
                    await createCollection('Favorites', null)
                    onReload()
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-ink-soft transition hover:bg-surface-2"
                >
                  Create a “Favorites” list
                </button>
              ) : (
                collections.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onToggle(c.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-ink transition hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border text-[9px] font-bold',
                        containedIn.includes(c.id)
                          ? 'border-gold/50 bg-gold/15 text-gold'
                          : 'border-line text-transparent'
                      )}
                    >
                      ✓
                    </span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-[10px] text-ink-dim">{c.itemCount}</span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
