import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import type { MediaKind } from '@shared/types'

interface TrailerModalProps {
  tmdbId: number | null
  kind: MediaKind
  title: string
  onClose: () => void
}

/**
 * Loads and plays the best YouTube trailer in a privacy-friendly nocookie
 * embed. Falls back gracefully when there is no trailer or no TMDB key.
 */
export default function TrailerModal({ tmdbId, kind, title, onClose }: TrailerModalProps) {
  const [key, setKey] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'none'>('idle')

  useEffect(() => {
    if (!tmdbId) return
    setState('loading')
    setKey(null)
    api.tmdb
      .trailer(tmdbId, kind)
      .then(v => {
        if (v && v.site === 'YouTube') {
          setKey(v.key)
          setState('ready')
        } else {
          setState('none')
        }
      })
      .catch(() => setState('none'))
  }, [tmdbId, kind])

  useEffect(() => {
    if (!tmdbId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tmdbId, onClose])

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <motion.div
        className="relative w-[min(960px,94vw)] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
        initial={{ scale: 0.95, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 8, opacity: 0 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <span className="truncate text-sm font-medium text-ink">
            <span className="text-ink-dim">Trailer · </span>
            {title}
          </span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-ink-soft transition hover:border-gold hover:text-gold"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6L18 18M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="aspect-video w-full bg-black">
          {state === 'ready' && key ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0`}
              title={`Trailer: ${title}`}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {state === 'loading' ? (
                <div className="flex items-center gap-3 text-sm text-ink-dim">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                  Finding a trailer…
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-sm font-medium text-ink-soft">No trailer available</div>
                  <div className="mt-1 text-xs text-ink-dim">
                    This title has no video on TMDB, or the catalog is offline.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
