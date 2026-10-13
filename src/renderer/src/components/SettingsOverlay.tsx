import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUI, useData } from '../store'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { ACCENTS, applyAccent, applyDensity } from '../lib/theme'
import type { Density } from '../lib/theme'
import StatusPaletteManager from './StatusPaletteManager'
import { SUB_LANGUAGES, DEFAULT_SUB_LANGUAGE } from '../lib/languages'
import type { Quality, tmdbConfig } from '@shared/types'

type Tab = 'catalog' | 'statuses' | 'appearance' | 'playback' | 'data'

const TABS: { id: Tab; label: string }[] = [
  { id: 'catalog', label: 'Catalog' },
  { id: 'statuses', label: 'Statuses' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'playback', label: 'Playback' },
  { id: 'data', label: 'Data' }
]

export default function SettingsOverlay() {
  const open = useUI(s => s.settingsOpen)
  const setOpen = useUI(s => s.setSettingsOpen)
  const setReduceMotion = useUI(s => s.setReduceMotion)
  const backfillRuntimes = useData(s => s.backfillRuntimes)
  const [tab, setTab] = useState<Tab>('catalog')

  const [apiKey, setApiKey] = useState('')
  const [readToken, setReadToken] = useState('')
  const [tmdb, setTmdb] = useState<tmdbConfig | null>(null)
  const [quality, setQuality] = useState<Quality>('cinematic')
  const [accent, setAccent] = useState<string>('gold')
  const [density, setDensity] = useState<Density>('comfortable')
  const [adBlock, setAdBlock] = useState(true)
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [saved, setSaved] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [backupPass, setBackupPass] = useState('')
  const [autoFolder, setAutoFolder] = useState<string | null>(null)
  const [autoOnExit, setAutoOnExit] = useState(false)
  const [lastAuto, setLastAuto] = useState<string | null>(null)
  const [autoMsg, setAutoMsg] = useState<string | null>(null)
  const [runtimeMsg, setRuntimeMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Subtitle preferences
  const [subLang, setSubLang] = useState(DEFAULT_SUB_LANGUAGE)
  const [subLangOff, setSubLangOff] = useState(false)
  const [osKey, setOsKey] = useState('')
  const [subdlKey, setSubdlKey] = useState('')
  const [subCache, setSubCache] = useState({ files: 0, bytes: 0 })
  // Blocks the auto-save effect until the stored values have been read, so
  // opening Settings cannot erase a key the user already saved.
  const [subsLoaded, setSubsLoaded] = useState(false)

  useEffect(() => {
    if (!open) return
    api.tmdb.status().then(setTmdb)
    api.settings.get<Quality>('app.quality').then(q => q && setQuality(q))
    api.settings.get<string>('app.accent').then(a => a && setAccent(a))
    api.settings.get<Density>('app.density').then(d => d && setDensity(d))
    api.settings.get<boolean>('app.adBlock').then(b => {
      if (b !== null && b !== undefined) setAdBlock(b !== false)
    })
    // The network blocker is the source of truth — if it failed to boot at
    // startup (offline, list download failed), reflect that honestly.
    api.adblock.status().then(live => {
      if (!live) setAdBlock(false)
    })
    api.settings.get<string>('tmdb.apiKey').then(k => k && setApiKey(k))
    api.settings.get<string>('tmdb.readToken').then(t => t && setReadToken(t))
    api.settings.get<boolean>('notifications.enabled').then(e => {
      if (e !== null && e !== undefined) setNotifEnabled(e)
    })
    api.backup
      .status()
      .then(s => {
        setAutoFolder(s.folder)
        setAutoOnExit(s.onExit)
        setLastAuto(s.lastAuto)
      })
      .catch(() => {
        /* an older main build without the channel just shows empty state */
      })

api.settings.get<string>('subtitles.language').then(l => {
      if (l) setSubLang(l)
      setSubsLoaded(true)
    })
    api.settings.get<boolean>('subtitles.defaultOff').then(v => v !== null && setSubLangOff(v))
    api.settings.get<string>('subtitles.opensubtitlesKey').then(k => k && setOsKey(k))
    api.settings.get<string>('subtitles.subdlKey').then(k => k && setSubdlKey(k))
    api.subtitles.stats().then(setSubCache).catch(() => undefined)
  }, [open])

  /**
   * Subtitle settings save immediately — they are playback preferences, not
   * credentials, and nobody should have to hunt for a Save button to change
   * their subtitle language.
   *
   * The `subsLoaded` gate is load-bearing, not ceremony. Without it this effect
   * fires on open with empty state and writes `null` over the stored API keys.
   * Both the read and the write are async IPC, so whichever lands first wins:
   * when the write did, the read returned null and the key was destroyed. That
   * is why a key the user had definitely entered would come back empty, and
   * then every subtitle search silently found nothing.
   */
  useEffect(() => {
    if (!open || !subsLoaded) return
    api.settings.set('subtitles.language', subLang).catch(() => undefined)
    api.settings.set('subtitles.defaultOff', subLangOff).catch(() => undefined)
    api.settings.set('subtitles.opensubtitlesKey', osKey.trim() || null).catch(() => undefined)
    api.settings.set('subtitles.subdlKey', subdlKey.trim() || null).catch(() => undefined)
  }, [open, subsLoaded, subLang, subLangOff, osKey, subdlKey])

  const handleSave = async () => {
    await api.settings.set('tmdb.readToken', readToken.trim() || null)
    await api.settings.set('tmdb.apiKey', apiKey.trim() || null)
    await api.settings.set('app.quality', quality)
    await api.settings.set('app.accent', accent)
    await api.settings.set('app.density', density)
    await api.settings.set('app.adBlock', adBlock)
    await api.settings.set('notifications.enabled', notifEnabled)
    setReduceMotion(quality === 'battery')
    applyAccent(accent)
    applyDensity(density)
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

  const handleChooseFolder = async () => {
    setAutoMsg(null)
    try {
      const folder = await api.backup.setFolder()
      if (folder) {
        setAutoFolder(folder)
        setAutoMsg('Folder set — backups will be written there.')
      }
    } catch (e) {
      setAutoMsg((e as Error).message)
    }
  }

  const handleAutoBackup = async () => {
    setAutoMsg(null)
    if (!autoFolder) {
      setAutoMsg('Pick a folder first.')
      return
    }
    if (backupPass.length < 4) {
      setAutoMsg('Enter a passphrase of at least 4 characters.')
      return
    }
    setBusy(true)
    try {
      const res = await api.backup.auto(backupPass, autoFolder)
      const s = await api.backup.status()
      setLastAuto(s.lastAuto)
      setAutoMsg(
        `Backed up ${(res.size / 1024 / 1024).toFixed(1)} MB → ${res.path}. ` +
          'Point this at a Google Drive or OneDrive folder and it syncs automatically.'
      )
    } catch (e) {
      setAutoMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleRecalc = async () => {
    setRuntimeMsg(null)
    setBusy(true)
    try {
      const res = await backfillRuntimes()
      setRuntimeMsg(
        res.total === 0
          ? 'Everything is already up to date — no missing runtimes found.'
          : `Fixed ${res.fixed} of ${res.total} titles. Watch time now reflects real runtimes.`
      )
    } catch (e) {
      setRuntimeMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

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
            className="glass-strong relative flex h-fit max-h-[88vh] w-[min(760px,94vw)] overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* Sidebar */}
            <div className="flex w-[172px] shrink-0 flex-col border-r border-line bg-[#0e1015]/60 py-5">
              <div className="flex items-center gap-2.5 px-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-[#1a1d25] to-[#0b0c0f] text-gold">
                  <svg viewBox="0 0 512 512" className="h-[18px] w-[18px]" aria-hidden="true">
                    <g transform="rotate(-22 256 256)">
                      <ellipse cx="256" cy="256" rx="180" ry="78" fill="none" stroke="currentColor" strokeWidth="9" opacity="0.45" />
                    </g>
                    <path d="M170 148 L170 364 L382 256 Z" fill="currentColor" />
                    <circle cx="423" cy="218" r="16" fill="currentColor" opacity="0.9" />
                  </svg>
                </div>
                <span className="font-display text-sm font-bold text-ink">CineTrack</span>
              </div>
              <nav className="mt-6 flex flex-col gap-1 px-3">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'rounded-lg px-3 py-2 text-left text-xs font-medium transition',
                      tab === t.id
                        ? 'bg-gold/12 text-gold'
                        : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
              <div className="mt-auto px-5 text-[10px] leading-relaxed text-ink-dim">
                Local &amp; private
              </div>
            </div>

            {/* Main column */}
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex items-center justify-between border-b border-line px-7 py-5">
                <div>
                  <h2 className="font-display text-xl font-bold text-ink">Settings</h2>
                  <p className="mt-0.5 text-xs text-ink-dim">
                    {tab === 'catalog' && 'Connect the live catalog, trailers & watch data'}
                    {tab === 'statuses' && 'Customize your status palette and watch-time rules'}
                    {tab === 'appearance' && 'Theme, density, and motion'}
                    {tab === 'playback' && 'Streaming sources, ad blocking, and tracking'}
                    {tab === 'data' && 'Backup, restore, and library data'}
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

              {/* [&>section]:shrink-0 — a flex column lets its children shrink,
                  and an <input> inside one got squashed to a few pixels tall
                  rather than being pushed below the fold by overflow. */}
              <div className="row-scroll flex flex-col gap-7 overflow-y-auto p-7 [&>section]:shrink-0 [&>div]:shrink-0">
                {tab === 'catalog' && (
                  <>
                    <section>
                      <SectionLabel>TMDB connection</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        The bundled catalog works offline. Adding a free TMDB key unlocks the full
                        live catalog (~1M titles), cast data, trailers, and where-to-watch. Get one
                        at themoviedb.org/settings/api.
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
                              Offline
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

                    <section>
                      <SectionLabel>Reminders</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        Get a desktop notification when a series you're watching airs a new episode
                        you haven't logged. Checked hourly; requires a TMDB key.
                      </p>
                      <ToggleRow
                        on={notifEnabled}
                        onClick={() => setNotifEnabled(n => !n)}
                        label={notifEnabled ? 'New-episode reminders on' : 'Reminders off'}
                      />
                    </section>
                  </>
                )}

                {tab === 'statuses' && (
                  <section>
                    <SectionLabel>Status palette</SectionLabel>
                    <StatusPaletteManager />
                  </section>
                )}

                {tab === 'appearance' && (
                  <>
                    <section>
                      <SectionLabel>Accent theme</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        Recolors the logo, active tabs, buttons, and focus glow across the whole app.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {ACCENTS.map(a => (
                          <button
                            key={a.id}
                            onClick={() => {
                              setAccent(a.id)
                              applyAccent(a.id)
                            }}
                            className={cn(
                              'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition',
                              accent === a.id
                                ? 'border-gold/60 bg-gold/10'
                                : 'border-line bg-surface hover:border-gold/40'
                            )}
                          >
                            <span
                              className="h-5 w-5 shrink-0 rounded-full shadow-[0_0_12px_-2px]"
                              style={{ backgroundColor: a.gold, color: a.gold }}
                            />
                            <span
                              className={cn(
                                'text-xs font-medium',
                                accent === a.id ? 'text-ink' : 'text-ink-soft'
                              )}
                            >
                              {a.label}
                            </span>
                            {accent === a.id && (
                              <svg
                                className="ml-auto text-gold"
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                              >
                                <path
                                  d="M4 12.5l5 5L20 6.5"
                                  stroke="currentColor"
                                  strokeWidth="2.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>

                    <section>
                      <SectionLabel>Density</SectionLabel>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              v: 'comfortable',
                              t: 'Comfortable',
                              d: 'Large posters, generous spacing'
                            },
                            {
                              v: 'compact',
                              t: 'Compact',
                              d: 'Smaller posters — fits large libraries'
                            }
                          ] as { v: Density; t: string; d: string }[]
                        ).map(p => (
                          <button
                            key={p.v}
                            onClick={() => {
                              setDensity(p.v)
                              applyDensity(p.v)
                            }}
                            className={cn(
                              'flex flex-col gap-1.5 rounded-xl border p-3 text-left transition',
                              density === p.v
                                ? 'border-gold bg-gold/10'
                                : 'border-line bg-surface hover:border-gold/40'
                            )}
                          >
                            <span
                              className={cn(
                                'text-sm font-semibold',
                                density === p.v ? 'text-gold' : 'text-ink'
                              )}
                            >
                              {p.t}
                            </span>
                            <span className="text-[10.5px] leading-snug text-ink-dim">{p.d}</span>
                          </button>
                        ))}
                      </div>
                    </section>

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
                  </>
                )}

                {tab === 'playback' && (
                  <>
                    <section>
                      <SectionLabel>Ad blocker</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        Streams play in a sandboxed player with EasyList-grade network blocking, so
                        ad and tracking requests are cancelled before they load — popups and
                        pop-unders can't open at all. Runs in an isolated session, so the rest of
                        the app is unaffected.
                      </p>
                      <ToggleRow
                        on={adBlock}
                        onClick={() => {
                          const next = !adBlock
                          setAdBlock(next)
                          api.adblock.set(next).catch(e => console.error('[adblock]', e))
                        }}
                        label={adBlock ? 'Network ad blocker on' : 'Ad blocker off'}
                      />
                      {adBlock && (
                        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald/25 bg-emerald/5 px-3.5 py-2.5 text-[11px] text-emerald">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                            <path d="M8.5 12l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Protected at the network layer — ads never reach the renderer.
                        </div>
                      )}
                    </section>

                    <section>
                      <SectionLabel>Watch progress</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        CineTrack remembers the source and episode you were last on, per title, and
                        jumps back there when you reopen the player. After a full view it logs the
                        watch automatically, so your stats stay current without manual entry.
                      </p>
                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[11px] text-ink-soft">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 text-gold">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                          <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        Resume points are stored locally and expire after 30 days.
                      </div>
                    </section>

                    <section>
                      <SectionLabel>Streaming sources</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        Free providers are community-maintained and rotate. If a source stops
                        playing, switch to another in the watch window. Providers that set
                        anti-framing headers are filtered out automatically.
                      </p>
                    </section>

                    <section>
                      <SectionLabel>Subtitles</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        Subtitles are fetched on demand and cached locally, so they work
                        offline and never cost you a second download. Where the player reports
                        its own position, timing is exact and the
                        <strong className="mx-1 text-ink-soft">Sync</strong> button reads
                        &ldquo;In sync&rdquo;. A few providers stay silent, and there you press
                        it once when a line you recognise appears.
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select
                          value={subLang}
                          onChange={e => setSubLang(e.target.value)}
                          className="no-drag cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft focus:border-gold focus:outline-none"
                        >
                          {SUB_LANGUAGES.map(l => (
                            <option key={l.code} value={l.code} className="bg-surface text-ink">
                              {l.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setSubLangOff(v => !v)}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-xs font-medium transition',
                            !subLangOff
                              ? 'border-gold/60 bg-gold/15 text-gold'
                              : 'border-line bg-surface text-ink-soft hover:border-gold/40'
                          )}
                        >
                          {subLangOff ? 'Overlay off by default' : 'Overlay on by default'}
                        </button>
                      </div>

<input
                        type="password"
                        value={subdlKey}
                        onChange={e => setSubdlKey(e.target.value)}
                        placeholder="SubDL API key (recommended - free, 2,000 searches/day)"
                        className="no-drag mt-2.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                      />
                      <p className="mt-2 text-[10.5px] leading-relaxed text-ink-dim">
                        Get a free key at subdl.com/panel/api. SubDL inherited Subscene's
                        archive, is keyed by TMDB id, and has the best series coverage of the
                        three sources. Nothing works without an account except the built-in
                        provider below.
                      </p>

                      <input
                        type="password"
                        value={osKey}
                        onChange={e => setOsKey(e.target.value)}
                        placeholder="OpenSubtitles API key (optional - deepest catalogue)"
                        className="no-drag mt-3 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                      />
                      <p className="mt-2 text-[10.5px] leading-relaxed text-ink-dim">
                        The built-in source needs no account and stays on by default.
                        OpenSubtitles has the largest catalogue but a free key only allows 20
                        downloads a day, so it works best as a fallback. Keys stay on this
                        machine and go nowhere except the provider you paste them into.
                      </p>

                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[11px] text-ink-dim">
                          {subCache.files > 0
                            ? `${subCache.files} cached ${subCache.files === 1 ? 'track' : 'tracks'} · ${(subCache.bytes / 1024).toFixed(0)} KB`
                            : 'No subtitles cached yet'}
                        </span>
                        <button
                          onClick={async () => {
                            setBusy(true)
                            try {
                              const res = await api.subtitles.clear()
                              setSubCache(await api.subtitles.stats())
                              setAutoMsg?.(`Cleared ${res.files} cached ${res.files === 1 ? 'track' : 'tracks'}.`)
                            } catch (e) {
                              setAutoMsg?.((e as Error).message)
                            } finally {
                              setBusy(false)
                            }
                          }}
                          disabled={busy || subCache.files === 0}
                          className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-crimson/40 hover:text-crimson disabled:opacity-40"
                        >
                          Clear cache
                        </button>
                      </div>
                    </section>
                  </>
                )}

                {tab === 'data' && (
                  <>
                    <section>
                      <SectionLabel>Automatic cloud backup</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        This is how CineTrack backs up to Google Drive, OneDrive, or iCloud: pick the
                        folder your sync client watches, and every backup lands there encrypted.
                        Nothing is ever uploaded by the app itself — your sync client does it, so no
                        account login or cloud permission is needed.
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex h-fit min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[11px] text-ink-soft">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 text-gold">
                            <path d="M3 7.5A2.5 2.5 0 015.5 5h3.2l1.5 2h8.3A2.5 2.5 0 0121 9.5v8A2.5 2.5 0 0118.5 20h-13A2.5 2.5 0 013 17.5v-10z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                          </svg>
                          <span className="truncate">
                            {autoFolder ?? 'No folder chosen yet'}
                          </span>
                        </div>
                        <button
                          onClick={handleChooseFolder}
                          disabled={busy}
                          className="shrink-0 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-xs font-medium text-ink-soft transition hover:border-gold/40 hover:text-gold disabled:opacity-40"
                        >
                          Choose folder
                        </button>
                      </div>
                      {lastAuto && (
                        <p className="mt-2 text-[10.5px] text-ink-dim">
                          Last automatic backup{' '}
                          {new Date(lastAuto).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      )}
                      <input
                        type="password"
                        value={backupPass}
                        onChange={e => setBackupPass(e.target.value)}
                        placeholder="Passphrase for automatic backups"
                        className="no-drag mt-3 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                      />
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          onClick={handleAutoBackup}
                          disabled={busy || backupPass.length < 4 || !autoFolder}
                          className="flex-1 rounded-lg border border-gold/50 bg-gold/15 px-3.5 py-2 text-xs font-semibold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Back up now
                        </button>
                        <button
                          onClick={async () => {
                            const next = !autoOnExit
                            setAutoOnExit(next)
                            await api.backup.setOnExit(next)
                            setAutoMsg(
                              next
                                ? 'A backup will be written to the folder every time you quit.'
                                : null
                            )
                          }}
                          disabled={!autoFolder}
                          className={cn(
                            'flex-1 rounded-lg border px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                            autoOnExit
                              ? 'border-emerald/40 bg-emerald/10 text-emerald'
                              : 'border-line bg-surface text-ink-soft hover:border-gold/40 hover:text-gold'
                          )}
                        >
                          {autoOnExit ? 'Back up on exit: on' : 'Back up on exit: off'}
                        </button>
                      </div>
                      {autoMsg && (
                        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-dim">{autoMsg}</p>
                      )}
                      <p className="mt-2 text-[10px] leading-relaxed text-ink-dim">
                        The passphrase is stored with Windows encryption (DPAPI) so unattended
                        backups work — the .cbk file itself stays AES-256 encrypted, so a copy on
                        Drive is useless without it.
                      </p>
                    </section>

                    <section>
                      <SectionLabel>Manual backup &amp; restore</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        Export the whole library to an AES-256 encrypted <code>.cbk</code> file you
                        can carry anywhere, then restore it on any machine with the same passphrase.
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <button
                          onClick={handleExport}
                          disabled={backupPass.length < 4 || busy}
                          className="flex-1 rounded-lg border border-gold/50 bg-gold/15 px-3.5 py-2 text-xs font-semibold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Export backup
                        </button>
                        <button
                          onClick={handleImport}
                          disabled={!backupPass || busy}
                          className="flex-1 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink-soft transition hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Restore backup
                        </button>
                      </div>
                      {backupMsg && (
                        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-dim">{backupMsg}</p>
                      )}
                    </section>

                    <section>
                      <SectionLabel>Watch time</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        Titles added before runtimes were tracked can show as zero minutes. This
                        re-fetches them from TMDB and recalculates your totals. Needs a TMDB key.
                      </p>
                      <button
                        onClick={handleRecalc}
                        disabled={busy}
                        className="mt-3 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:border-gold/40 hover:text-gold disabled:opacity-40"
                      >
                        {busy ? 'Recalculating…' : 'Recalculate watch time'}
                      </button>
                      {runtimeMsg && (
                        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-dim">
                          {runtimeMsg}
                        </p>
                      )}
                    </section>

                    <section>
                      <SectionLabel>Library data</SectionLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">
                        Your library is stored locally in a single SQLite file. Nothing leaves your
                        machine unless you connect TMDB or export a backup.
                      </p>
                      <button
                        onClick={handleOpenDataDir}
                        className="mt-3 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:border-gold/40 hover:text-gold"
                      >
                        Open data folder
                      </button>
                    </section>

                    <section className="border-t border-line pt-5">
                      <p className="text-[10.5px] leading-relaxed text-ink-dim">
                        CineTrack · Movie &amp; TV data and poster artwork provided by TMDB
                        (themoviedb.org). This product uses the TMDB API but is not endorsed or
                        certified by TMDB. Your use of TMDB data is subject to their terms of
                        service.
                      </p>
                    </section>
                  </>
                )}
              </div>

              <footer className="flex items-center justify-between gap-3 border-t border-line px-7 py-4">
                <span className="text-[10.5px] text-ink-dim">
                  Changes apply instantly · press{' '}
                  <kbd className="rounded border border-line bg-surface px-1 text-[9.5px]">,</kbd>{' '}
                  to reopen
                </span>
                <div className="flex items-center gap-3">
                  {saved && <span className="text-xs text-emerald">Saved</span>}
                  <button
                    onClick={handleSave}
                    className="rounded-lg border border-gold bg-gold px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-gold-soft"
                  >
                    Save settings
                  </button>
                </div>
              </footer>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ToggleRow({
  on,
  onClick,
  label
}: {
  on: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'mt-3 flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition',
        on ? 'border-emerald/40 bg-emerald/10' : 'border-line bg-surface'
      )}
    >
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition',
          on ? 'bg-emerald' : 'bg-surface-3'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
            on ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{children}</div>
}
