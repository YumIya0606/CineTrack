import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStatuses } from '../store'
import { cn } from '../lib/utils'
import { statusColorDot } from '@shared/status'
import type { StatusDef } from '@shared/types'

const COLORS: { id: string; hex: string; label: string }[] = [
  { id: 'gold', hex: '#f5b544', label: 'Gold' },
  { id: 'emerald', hex: '#3ecf8e', label: 'Green' },
  { id: 'azure', hex: '#5b8def', label: 'Blue' },
  { id: 'violet', hex: '#b07ce8', label: 'Violet' },
  { id: 'crimson', hex: '#e84855', label: 'Red' },
  { id: 'slate', hex: '#8d99ae', label: 'Grey' }
]

/**
 * The status palette editor. Statuses are the spine of the app, so this lets
 * the user rename them, recolour them, reorder them, decide which ones count
 * toward watch time, and add their own.
 */
export default function StatusPaletteManager() {
  const statuses = useStatuses(s => s.statuses)
  const createStatus = useStatuses(s => s.createStatus)
  const updateStatus = useStatuses(s => s.updateStatus)
  const deleteStatus = useStatuses(s => s.deleteStatus)
  const reorderStatuses = useStatuses(s => s.reorderStatuses)

  const [newLabel, setNewLabel] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const handleCreate = async () => {
    const label = newLabel.trim()
    if (!label) return
    setErr(null)
    setMsg(null)
    try {
      await createStatus({ label, color: 'azure', countsTowardWatchTime: false, derivable: false })
      setNewLabel('')
      setMsg(`Added "${label}".`)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const handleDelete = async (id: number, label: string) => {
    setErr(null)
    setMsg(null)
    try {
      const moved = await deleteStatus(id)
      setMsg(
        moved > 0
          ? `Deleted "${label}" — ${moved} ${moved === 1 ? 'title' : 'titles'} moved to Planned.`
          : `Deleted "${label}".`
      )
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...statuses]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    // Send the new ordering by row id so the server can renumber positions.
    const order = next.map((s, i) => ({ id: s.id, position: i }))
    try {
      await reorderStatuses(order)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <div>
      <p className="mb-4 text-xs leading-relaxed text-ink-dim">
        Statuses drive your library, stats, and watch time. Rename them, recolour them, or add your
        own — everything updates live. <strong className="text-ink-soft">Completed</strong> and{' '}
        <strong className="text-ink-soft">Rewatching</strong> count toward watch time; a series'
        Watching / Planned / Completed status follows its episode progress automatically unless you
        pick one by hand.
      </p>

      {/* Add new */}
      <div className="mb-4 flex gap-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreate()
          }}
          placeholder="New status name (e.g. Rewatch Someday)"
          className="no-drag flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
        />
        <button
          onClick={handleCreate}
          disabled={!newLabel.trim()}
          className="shrink-0 rounded-lg border border-gold/50 bg-gold/15 px-4 py-2 text-xs font-semibold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add status
        </button>
      </div>

      {(msg || err) && (
        <p className={cn('mb-3 text-[11px]', err ? 'text-crimson' : 'text-emerald')}>{err ?? msg}</p>
      )}

      {/* List */}
      <div className="flex flex-col gap-2">
        {statuses.map((s, i) => (
          <StatusRow
            key={s.key}
            def={s}
            index={i}
            total={statuses.length}
            onMove={move}
            onToggleWatchTime={v => updateStatus(s.id, { countsTowardWatchTime: v })}
            onToggleDerivable={v => updateStatus(s.id, { derivable: v })}
            onRename={label => updateStatus(s.id, { label })}
            onColor={color => updateStatus(s.id, { color })}
            onDelete={() => handleDelete(s.id, s.label)}
          />
        ))}
      </div>
    </div>
  )
}

function StatusRow({
  def,
  index,
  total,
  onMove,
  onToggleWatchTime,
  onToggleDerivable,
  onRename,
  onColor,
  onDelete
}: {
  def: StatusDef
  index: number
  total: number
  onMove: (index: number, dir: -1 | 1) => void
  onToggleWatchTime: (v: boolean) => void
  onToggleDerivable: (v: boolean) => void
  onRename: (label: string) => void
  onColor: (color: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(def.label)

  return (
    <motion.div
      layout
      className="flex items-center gap-3 rounded-xl border border-line bg-surface/60 px-3.5 py-3"
    >
      {/* Reorder */}
      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          className="text-ink-dim transition hover:text-gold disabled:opacity-20"
          aria-label="Move up"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          className="text-ink-dim transition hover:text-gold disabled:opacity-20"
          aria-label="Move down"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <span className={cn('h-3 w-3 shrink-0 rounded-full', statusColorDot(def.color))} />

      {/* Label */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            value={label}
            autoFocus
            onChange={e => setLabel(e.target.value)}
            onBlur={() => {
              if (label.trim() && label !== def.label) onRename(label.trim())
              setEditing(false)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setLabel(def.label)
                setEditing(false)
              }
            }}
            className="no-drag w-full rounded-md border border-gold bg-surface px-2 py-1 text-xs text-ink focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="truncate text-left text-sm font-medium text-ink hover:text-gold"
            title="Rename"
          >
            {def.label}
          </button>
        )}
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-dim">
          <span className="rounded border border-line bg-surface-2 px-1 py-px">{def.key}</span>
          {def.isSystem && <span>built-in</span>}
        </div>
      </div>

      {/* Colour */}
      <div className="flex shrink-0 items-center gap-1.5">
        {COLORS.map(c => (
          <button
            key={c.id}
            onClick={() => onColor(c.id)}
            title={c.label}
            aria-label={c.label}
            aria-pressed={def.color === c.id}
            className={cn(
              'h-5 w-5 rounded-full transition',
              def.color === c.id
                ? 'ring-2 ring-offset-2 ring-offset-[#0e1015] scale-110'
                : 'ring-1 ring-white/10 hover:scale-110'
            )}
            style={{
              backgroundColor: c.hex,
              // Tailwind can't build a dynamic ring colour, so set it inline.
              ...(def.color === c.id ? { boxShadow: `0 0 0 2px #0e1015, 0 0 0 4px ${c.hex}` } : {})
            }}
          />
        ))}
      </div>

      {/* Behaviour toggles — labelled, because a lone icon is a guessing game */}
      <div className="flex shrink-0 items-center gap-1.5">
        <ChipToggle
          on={def.countsTowardWatchTime}
          onClick={() => onToggleWatchTime(!def.countsTowardWatchTime)}
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
          label="Watch time"
          title="Count titles in this status toward your watch-time total"
        />
        <ChipToggle
          on={def.derivable}
          onClick={() => onToggleDerivable(!def.derivable)}
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          }
          label="Auto"
          title="Let episode progress assign this status automatically"
        />
        {!def.isSystem && (
          <button
            onClick={onDelete}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-crimson/40 bg-crimson/10 px-2.5 text-[11px] font-medium text-crimson transition hover:bg-crimson/20"
            title="Delete this status — its titles move to Planned"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Delete
          </button>
        )}
      </div>
    </motion.div>
  )
}

function ChipToggle({
  on,
  onClick,
  icon,
  label,
  title
}: {
  on: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition',
        on
          ? 'border-gold/60 bg-gold/15 text-gold'
          : 'border-line bg-surface text-ink-dim hover:border-gold/40 hover:text-ink-soft'
      )}
    >
      {icon}
      {label}
    </button>
  )
}