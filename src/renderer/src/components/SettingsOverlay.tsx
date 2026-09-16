import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUI } from '../store'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import type { Quality, tmdbConfig } from '@shared/types'

export default function SettingsOverlay() {
  const open = useUI(s => s.settingsOpen)
  const setOpen = useUI(s => s.setSettingsOpen)
  const setReduceMotion = useUI(s => s.setReduceMotion)

  const [apiKey, setApiKey] = useState('')
  const [readToken, setReadToken] = useState('')
  const [tmdb, setTmdb] = useState<tmdbConfig | null>(null)
  const [quality, setQuality] = useState<Quality>('cinematic')
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [saved, setSaved] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [backupPass, setBackupPass] = useState('')

  useEffect(() => {
    if (!open) return
    api.tmdb.status().then(setTmdb)
    api.settings.get<Quality>('app.quality').then(q => q && setQuality(q))
    api.settings.get<string>('tmdb.apiKey').then(k => k && setApiKey(k))
    api.settings.get<string>('tmdb.readToken').then(t => t && setReadToken(t))
    api.settings.get<boolean>('notifications.enabled').then(e => {
      if (e !== null && e !== undefined) setNotifEnabled(e)
    })
  }, [open])

  const handleSave = async () => {
    await api.settings.set('tmdb.readToken', readToken.trim() || null)
    await api.settings.set('tmdb.apiKey', apiKey.trim() || null)
    await api.settings.set('app.quality', quality)
    await api.settings.set('notifications.enabled', notifEnabled)
    setReduceMotion(quality === 'battery')
    setTmdb(await api.tmdb.status())
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const handleExport = async () => {
    setBackupMsg(null)
    try {
      const res = await api.backup.export(backupPass)
      setBackupMsg(`Backed up ${(res.size / 1024 / 1024).toFixed(1)} MB → ${res.path}`)
    } catch (e) {
      setBackupMsg((e as Error).message)
    }
  }

  const handleImport = async () => {
    setBackupMsg(null)
    try {
      const res = await api.backup.import(backupPass)
      setBackupMsg(`Restored ${(res.size / 1024 / 1024).toFixed(1)} MB — reloading…`)
      setTimeout(() => window.location.reload(), 1400)
    } catch (e) {
      setBackupMsg((e as Error).message)
    }
  }

  const handleOpenDataDir = () => api.app.openDataDir()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-30 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            className="glass-strong relative flex h-fit max-h-[86vh] w-[min(560px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-line px-7 py-5">
              <div>
                <h2 className="font-display text-xl font-bold text-ink">Settings</h2>
                <p className="mt-0.5 text-xs text-ink-dim">
                  Catalog source, reminders, backup, and performance
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition hover:border-gold hover:text-gold"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="flex flex-col gap-7 overflow-y-auto p-7">
              {/* TMDB */}
              <section>
                <SectionLabel>TMDB connection</SectionLabel>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                  The bundled catalog works offline. Adding a free TMDB key unlocks the full live
                  catalog (~1M titles), cast data, trailers, and where-to-watch. Get one at
                  themoviedb.org/settings/api.
                </p>
                <div className="mt-3 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={readToken}
                      onChange={e => setReadToken(e.target.value)}
                      placeholder="TMDB read access token (v4 — recommended)"
                      className="no-drag w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                    />
                    {tmdb?.connected ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald/40 bg-emerald/10 px-2.5 py-2 text-[11px] font-medium text-emerald">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
                        Connected
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-[11px] font-medium text-ink-dim">
                        <span className="h-1.5 w-1.5 rounded-full bg-ink-dim" />
                        Offline mode
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="…or the legacy v3 API key"
                      className="no-drag w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* Notifications */}
              <section>
                <SectionLabel>Reminders</SectionLabel>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                  Get a desktop notification when a series you're watching airs a new episode you
                  haven't logged. Checked hourly; requires a TMDB key.
                </p>
                <button
                  onClick={() => setNotifEnabled(n => !n)}
                  className={cn(
                    'mt-3 flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition',
                    notifEnabled
                      ? 'border-emerald/40 bg-emerald/10'
                      : 'border-line bg-surface'
                  )}
                >
                  <span
                    className={cn(
                      'relative h-5 w-9 shrink-0 rounded-full transition',
                      notifEnabled ? 'bg-emerald' : 'bg-surface-3'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                        notifEnabled ? 'left-[18px]' : 'left-0.5'
                      )}
                    />
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {notifEnabled ? 'New-episode reminders on' : 'Reminders off'}
                  </span>
                </button>
              </section>

              {/* Backup */}
              <section>
                <SectionLabel>Cloud backup &amp; restore</SectionLabel>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                  Export your whole library to an AES-256 encrypted <code>.cbk</code> file. Store it
                  on Drive, OneDrive, or a USB stick, then restore on any machine with the same
                  passphrase.
                </p>
                <input
                  type="password"
                  value={backupPass}
                  onChange={e => setBackupPass(e.target.value)}
                  placeholder="Backup passphrase"
                  className="no-drag mt-3 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                />
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={handleExport}
                    disabled={backupPass.length < 4}
                    className="flex-1 rounded-lg border border-gold/50 bg-gold/15 px-3.5 py-2 text-xs font-semibold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Export backup
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!backupPass}
                    className="flex-1 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink-soft transition hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Restore backup
                  </button>
                </div>
                {backupMsg && (
                  <p className="mt-2.5 text-[11px] leading-relaxed text-ink-dim">{backupMsg}</p>
                )}
              </section>

              {/* Performance */}
              <section>
                <SectionLabel>Performance profile</SectionLabel>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        v: 'cinematic',
                        t: 'Cinematic',
                        d: 'Full effects, 3D tilt, shadows'
                      },
                      { v: 'balanced', t: 'Balanced', d: 'Softer effects, solid framerate' },
                      { v: 'battery', t: 'Battery', d: 'Reduced motion, no FX' }
                    ] as { v: Quality; t: string; d: string }[]
                  ).map(p => (
                    <button
                      key={p.v}
                      onClick={() => setQuality(p.v)}
                      className={cn(
                        'flex flex-col gap-1.5 rounded-xl border p-3 text-left transition',
                        quality === p.v
                          ? 'border-gold bg-gold/10'
                          : 'border-line bg-surface hover:border-gold/40'
                      )}
                    >
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          quality === p.v ? 'text-gold' : 'text-ink'
                        )}
                      >
                        {p.t}
                      </span>
                      <span className="text-[10.5px] leading-snug text-ink-dim">{p.d}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Data */}
              <section>
                <SectionLabel>Library data</SectionLabel>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                  Your library is stored locally in a single SQLite file. Nothing leaves your machine
                  unless you connect TMDB or export a backup.
                </p>
                <button
                  onClick={handleOpenDataDir}
                  className="mt-3 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:border-gold hover:text-gold"
                >
                  Open data folder
                </button>
              </section>

              {/* About / attribution */}
              <section className="border-t border-line pt-5">
                <p className="text-[10.5px] leading-relaxed text-ink-dim">
                  CineTrack · Movie & TV data and poster artwork provided by TMDB (themoviedb.org).
                  This product uses the TMDB API but is not endorsed or certified by TMDB. Your use of
                  TMDB data is subject to their terms of service.
                </p>
              </section>
            </div>

            <footer className="flex items-center justify-end gap-3 border-t border-line px-7 py-4">
              {saved && <span className="text-xs text-emerald">Saved</span>}
              <button
                onClick={handleSave}
                className="rounded-lg border border-gold bg-gold px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-gold-soft"
              >
                Save settings
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{children}</div>
}
