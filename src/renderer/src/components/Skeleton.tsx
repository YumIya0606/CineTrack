import { cn } from '../lib/utils'

/** A single shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} aria-hidden />
}

/** Poster-grid placeholder used before the first library render lands. */
export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-[2/3] w-full" />
          <Skeleton className="h-3 w-4/5 rounded-md" />
          <Skeleton className="h-2.5 w-2/5 rounded-md" />
        </div>
      ))}
    </div>
  )
}

/** Row-shaped placeholder for the board and other list surfaces. */
export function BoardRowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/40">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-line/60 px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-[60px] w-11 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3 rounded-md" />
            <Skeleton className="h-2.5 w-1/5 rounded-md" />
          </div>
          <Skeleton className="hidden h-2 w-28 rounded-full sm:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}
