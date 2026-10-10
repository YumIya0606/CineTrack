import type { StatusDef, WatchStatus } from '@shared/types'
import { statusColorClass, statusColorDot } from '@shared/status'
import { useStatuses } from '../store'
import { cn } from '../lib/utils'

interface StatusPillProps {
  status: string
  /** Show the title count / minutes alongside the label. */
  count?: number
  minutes?: number
  size?: 'sm' | 'md'
  className?: string
}

/**
 * A single status chip, coloured from the user's palette. Falls back to a
 * neutral style if a status has no definition (e.g. a library row carrying a
 * key from a backup that predates a rename), so it never renders broken.
 */
export default function StatusPill({
  status,
  count,
  minutes,
  size = 'md',
  className
}: StatusPillProps) {
  const def = useStatuses(s => s.byKey[status]) as StatusDef | undefined
  const label = def?.label ?? status
  const colorClass = statusColorClass(def?.color)
  const dotClass = statusColorDot(def?.color)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-1 text-[11.5px]',
        colorClass,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="opacity-70">{count}</span>}
      {minutes !== undefined && minutes > 0 && (
        <span className="opacity-70">
          {formatShortMinutes(minutes)}
        </span>
      )}
    </span>
  )
}

/** Compact watch-time label for chips (e.g. "12h", "3d 4h"). */
export function formatShortMinutes(minutes: number): string {
  if (minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

export type { WatchStatus }