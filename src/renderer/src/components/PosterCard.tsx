import { memo } from 'react'
import { motion } from 'framer-motion'
import { posterUrl, formatYear, formatRuntime } from '@shared/utils'
import type { CatalogItem, LibraryItem, WatchStatus } from '@shared/types'
import { useUI, useData } from '../store'
import { useTilt } from '../lib/use-tilt'
import ProceduralPoster from './ProceduralPoster'
import { cn } from '../lib/utils'

interface PosterCardProps {
  item: CatalogItem | LibraryItem
  onClick?: () => void
  className?: string
  showStatus?: boolean
  index?: number
}

const STATUS_BADGE: Record<WatchStatus, { label: string; cls: string }> = {
  watching: { label: 'Watching', cls: 'bg-emerald/15 text-emerald border-emerald/30' },
  planned: { label: 'Planned', cls: 'bg-azure/15 text-azure border-azure/30' },
  completed: { label: 'Completed', cls: 'bg-gold/15 text-gold border-gold/30' },
  dropped: { label: 'Dropped', cls: 'bg-crimson/15 text-crimson-soft border-crimson/30' },
  rewatching: { label: 'Rewatching', cls: 'bg-gold/15 text-gold border-gold/30' }
}

function isLibraryItem(item: PosterCardProps['item']): item is LibraryItem {
  return typeof (item as LibraryItem).libraryId === 'number'
}

/** A single poster tile with hover zoom + status badge. */
function PosterCardImpl({ item, onClick, className, showStatus = true, index = 0 }: PosterCardProps) {
  const openDetail = useUI(s => s.openDetail)
  const addItem = useData(s => s.addItem)
  const reduceMotion = useUI(s => s.reduceMotion)
  const libraryItem = isLibraryItem(item) ? item : null
  const tilt = useTilt(10)

  const handleClick = () => onClick?.() ?? openDetail(item)

  const handleQuickAdd = async (e: React.MouseEvent, status: WatchStatus) => {
    e.stopPropagation()
    await addItem(item, status)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.03, 0.4),
        ease: [0.16, 1, 0.3, 1]
      }}
      className={cn('tilt-stage group relative shrink-0 cursor-pointer', className)}
      onClick={handleClick}
      whileHover={{ y: -6 }}
      onPointerMove={reduceMotion ? undefined : tilt.onMove}
      onPointerLeave={reduceMotion ? undefined : tilt.onLeave}
    >
      <div
        style={reduceMotion ? undefined : tilt.style}
        className="relative aspect-[2/3] overflow-hidden rounded-xl border border-line bg-surface-2 shadow-card [transform-style:preserve-3d] transition-shadow duration-300 group-hover:border-gold/40 group-hover:shadow-glow"
      >
        {item.posterPath ? (
          <img
            src={posterUrl(item.posterPath, 'w342') ?? undefined}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <ProceduralPoster title={item.title} year={item.year} className="h-full w-full" />
        )}

        {/* Gradient + info on hover — sits slightly forward of the poster */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={reduceMotion ? undefined : { transform: 'translateZ(28px)' }}
        />

        <div
          className="absolute inset-x-0 bottom-0 translate-y-2 p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          style={reduceMotion ? undefined : { transform: 'translateZ(44px)' }}
        >
          <div className="line-clamp-2 text-xs font-semibold leading-tight text-white">{item.title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/70">
            <span>{formatYear(item.year, item.endYear)}</span>
            {item.runtimeMinutes ? (
              <>
                <span>·</span>
                <span>{formatRuntime(item.runtimeMinutes)}</span>
              </>
            ) : null}
          </div>
          <div className="mt-2 flex gap-1.5">
            {!libraryItem && (
              <>
                <button
                  onClick={e => handleQuickAdd(e, 'completed')}
                  className="flex-1 rounded-md border border-gold/50 bg-gold/20 px-2 py-1 text-[10px] font-semibold text-gold backdrop-blur transition hover:bg-gold/35"
                >
                  Watched
                </button>
                <button
                  onClick={e => handleQuickAdd(e, 'planned')}
                  className="flex-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  Plan
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status badge */}
        {showStatus && libraryItem && (
          <div
            style={reduceMotion ? undefined : { transform: 'translateZ(36px)' }}
            className={cn(
              'absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold backdrop-blur',
              STATUS_BADGE[libraryItem.status].cls
            )}
          >
            {STATUS_BADGE[libraryItem.status].label}
          </div>
        )}

        {/* Rating chip */}
        {libraryItem?.rating ? (
          <div
            style={reduceMotion ? undefined : { transform: 'translateZ(36px)' }}
            className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full border border-gold/40 bg-black/55 px-1.5 py-0.5 text-[9.5px] font-bold text-gold backdrop-blur"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.5l2.9 6.0 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
            </svg>
            {libraryItem.rating}
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

const PosterCard = memo(PosterCardImpl)
export default PosterCard
