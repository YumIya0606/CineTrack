import { cn } from '../lib/utils'

/**
 * Four HUD-style corner brackets borrowed from the Cosmic UI pack's "frame"
 * primitive. Drawn in plain CSS rather than SVG paths so they scale with any
 * card and cost nothing to animate.
 */
export default function HudCorners({
  className,
  size = 10
}: {
  className?: string
  size?: number
}) {
  const style = { width: size, height: size }
  return (
    <div className={cn('pointer-events-none absolute inset-0', className)} aria-hidden>
      <span
        className="absolute left-2 top-2 border-l border-t border-gold/45"
        style={style}
      />
      <span
        className="absolute right-2 top-2 border-r border-t border-gold/45"
        style={style}
      />
      <span
        className="absolute bottom-2 left-2 border-b border-l border-gold/45"
        style={style}
      />
      <span
        className="absolute bottom-2 right-2 border-b border-r border-gold/45"
        style={style}
      />
    </div>
  )
}
