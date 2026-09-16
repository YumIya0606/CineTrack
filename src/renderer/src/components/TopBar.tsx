import { motion, AnimatePresence } from 'framer-motion'
import { useUI, useData, useNotifications } from '../store'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { useEffect, useState } from 'react'
import type { View } from '../store'
import type { tmdbConfig } from '@shared/types'

const VIEWS: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'discover', label: 'Discover' },
  { id: 'library', label: 'Library' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'lists', label: 'Lists' },
  { id: 'stats', label: 'Stats' }
]

export default function TopBar() {
  const view = useUI(s => s.view)
  const setView = useUI(s => s.setView)
  const setCommandOpen = useUI(s => s.setCommandOpen)
  const setSettingsOpen = useUI(s => s.setSettingsOpen)
  const library = useData(s => s.library)
  const notifications = useNotifications(s => s.notifications)
  const dismiss = useNotifications(s => s.dismiss)
  const loadNotifications = useNotifications(s => s.loadNotifications)

  const [tmdb, setTmdb] = useState<tmdbConfig | null>(null)
  const [bellOpen, setBellOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = () => api.tmdb.status().then(c => !cancelled && setTmdb(c))
    check()
    const t = setInterval(check, 15000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    loadNotifications()
    const t = setInterval(loadNotifications, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [loadNotifications])

  const connected = tmdb?.connected === true
  const watched = library.filter(l => l.status !== 'planned').length
  const unread = notifications.length

  return (
    <>
      {/* Top bar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-3.5">
        {/* Logo (icon only — the wordmark collided with the tabs) */}
        <button
          onClick={() => setView('home')}
          title="CineTrack — Home"
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-gold-dim shadow-glow transition hover:scale-105 hover:opacity-90"
        >
          <svg viewBox="0 0 100 100" className="h-5 w-5">
            <path d="M30 22 L30 78 L70 50 Z" fill="#0b0c0f" />
          </svg>
        </button>

        {/* Center tabs */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-[#12141a]/80 px-1.5 py-1.5 backdrop-blur-xl">
          {VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'relative rounded-full px-3.5 py-1.5 text-xs font-medium transition',
                view === v.id ? 'text-canvas' : 'text-ink-soft hover:text-ink'
              )}
            >
              {view === v.id && (
                <motion.span
                  layoutId="view-pill"
                  className="absolute inset-0 rounded-full bg-gold shadow-[0_0_14px_-2px] shadow-gold/70"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">{v.label}</span>
            </button>
          ))}
        </div>

        {/* Right cluster: notifications + search + settings */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <div className="relative">
            <button
              onClick={() => {
                setBellOpen(o => !o)
                if (!bellOpen) loadNotifications()
              }}
              title="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#12141a]/80 text-ink-soft backdrop-blur-xl transition hover:border-gold/50 hover:text-gold"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13.7 21a2 2 0 01-3.4 0"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crimson px-1 text-[9px] font-bold text-white shadow-[0_0_8px] shadow-crimson/60">
                  {unread}
                </span>
              )}
            </button>
            <AnimatePresence>
              {bellOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="glass-strong absolute right-0 top-11 z-30 w-[320px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <span className="text-xs font-semibold text-ink">Notifications</span>
                    {unread > 0 && (
                      <button
                        onClick={() => notifications.forEach(n => dismiss(n.id))}
                        className="text-[10.5px] font-medium text-ink-dim transition hover:text-gold"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-2">
                    {unread === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-ink-dim">
                        You're all caught up.
                      </div>
                    ) : (
                      notifications.map(n => (
                        <button
                          key={n.id}
                          onClick={() => {
                            dismiss(n.id)
                            if (n.catalogId) setView('library')
                            setBellOpen(false)
                          }}
                          className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-surface-2"
                        >
                          <span
                            className={cn(
                              'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                              n.kind === 'new_episode' ? 'bg-gold' : 'bg-azure'
                            )}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-ink">
                              {n.title}
                            </div>
                            {n.body && (
                              <div className="mt-0.5 truncate text-[11px] text-ink-dim">
                                {n.body}
                              </div>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={() => setCommandOpen(true)}
            title="Search (Ctrl+K)"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-[#12141a]/80 px-3 py-2 text-ink-soft backdrop-blur-xl transition hover:border-gold/50 hover:text-gold"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="hidden text-xs font-medium md:inline">Search</span>
            <kbd className="hidden rounded border border-line bg-surface px-1 text-[9.5px] text-ink-dim md:inline">
              Ctrl K
            </kbd>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#12141a]/80 text-ink-soft backdrop-blur-xl transition hover:border-gold/50 hover:text-gold"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom-left: TMDB connection status */}
      <div className="pointer-events-none fixed bottom-5 left-5 z-20">
        <button
          onClick={() => setSettingsOpen(true)}
          title="TMDB connection — click to configure"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#12141a]/80 px-3.5 py-2 backdrop-blur-xl transition hover:border-gold/40"
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              connected ? 'bg-emerald shadow-[0_0_8px] shadow-emerald' : 'bg-ink-dim'
            )}
          />
          <span className="text-xs text-ink-soft">
            {connected ? 'TMDB connected' : 'TMDB offline'}
          </span>
          <span className="text-xs text-ink-dim">·</span>
          <span className="text-xs text-ink-dim">
            {watched} {watched === 1 ? 'title' : 'titles'}
          </span>
        </button>
      </div>

      {/* Bottom-right: IMDb import */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-20">
        <button
          onClick={() => api.library.importImdb()}
          title="Import your IMDb ratings export"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#12141a]/80 px-3.5 py-2 text-xs font-medium text-ink-soft backdrop-blur-xl transition hover:border-gold/50 hover:text-gold"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Import IMDb
        </button>
      </div>

      {/* Offline banner when no key */}
      <AnimatePresence>
        {tmdb && !connected && (
          <motion.div
            className="pointer-events-none fixed inset-x-0 top-[64px] z-10 flex justify-center"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-azure/30 bg-azure/10 px-3.5 py-1.5 backdrop-blur-xl">
              <span className="h-1.5 w-1.5 rounded-full bg-azure" />
              <span className="text-[11px] text-ink-soft">
                Add a TMDB key in Settings to unlock the full live catalog, trailers & episode tracking
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
