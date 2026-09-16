import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useData } from '../store'
import { formatTotalRuntime } from '@shared/utils'
import type { Stats } from '@shared/types'

const W = 1200
const H = 675

/**
 * Renders a shareable "year in film" card to a canvas. Everything is drawn
 * locally from the user's stats — no screenshot of private data, no upload;
 * the user just saves the PNG and shares it where they like.
 */
export default function ShareCard({ onClose }: { onClose: () => void }) {
  const stats = useData(s => s.stats)
  const library = useData(s => s.library)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)

  const draw = () => {
    const cv = canvasRef.current
    if (!cv || !stats) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    // Backdrop
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#0b0c0f')
    bg.addColorStop(0.55, '#12141a')
    bg.addColorStop(1, '#0b0c0f')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Aurora glow
    const glow = ctx.createRadialGradient(W * 0.85, H * 0.15, 0, W * 0.85, H * 0.15, 420)
    glow.addColorStop(0, 'rgba(245,181,68,0.18)')
    glow.addColorStop(1, 'rgba(245,181,68,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    // Gold frame
    ctx.strokeStyle = 'rgba(245,181,68,0.35)'
    ctx.lineWidth = 2
    ctx.strokeRect(28, 28, W - 56, H - 56)

    // Brand
    ctx.fillStyle = '#f5b544'
    ctx.font = '700 30px Sora, system-ui, sans-serif'
    ctx.fillText('CineTrack', 64, 88)
    ctx.fillStyle = '#6d7186'
    ctx.font = '400 17px Inter, system-ui, sans-serif'
    ctx.fillText('My watching year', 64, 116)

    // Headline numbers
    const cells = [
      { label: 'TITLES', value: String(stats.totalTitles) },
      { label: 'COMPLETED', value: String(stats.completed) },
      { label: 'WATCH TIME', value: formatTotalRuntime(stats.totalRuntimeMinutes) },
      { label: 'AVG RATING', value: stats.averageRating ? stats.averageRating.toFixed(1) : '—' }
    ]
    const cellW = (W - 128 - 3 * 20) / 4
    cells.forEach((c, i) => {
      const x = 64 + i * (cellW + 20)
      const y = 160
      ctx.fillStyle = '#181b22'
      ctx.beginPath()
      ctx.roundRect(x, y, cellW, 150, 14)
      ctx.fill()
      ctx.strokeStyle = '#262b35'
      ctx.stroke()

      ctx.fillStyle = '#6d7186'
      ctx.font = '700 13px Inter, system-ui, sans-serif'
      ctx.fillText(c.label, x + 22, y + 36)

      ctx.fillStyle = '#f5b544'
      ctx.font = '700 42px Sora, system-ui, sans-serif'
      ctx.fillText(c.value, x + 22, y + 92)

      ctx.fillStyle = '#a8abbd'
      ctx.font = '400 14px Inter, system-ui, sans-serif'
      const sub = stats ? subtitleFor(c.label, stats) : ''
      ctx.fillText(sub, x + 22, y + 122)
    })

    // Top genres bar strip
    const topGenres = [...stats.byGenre].sort((a, b) => b.minutes - a.minutes).slice(0, 5)
    if (topGenres.length > 0) {
      ctx.fillStyle = '#ececf1'
      ctx.font = '700 17px Inter, system-ui, sans-serif'
      ctx.fillText('Top genres', 64, 380)

      const max = topGenres[0]!.minutes || 1
      topGenres.forEach((g, i) => {
        const y = 404 + i * 38
        ctx.fillStyle = '#a8abbd'
        ctx.font = '500 14px Inter, system-ui, sans-serif'
        ctx.fillText(capitalize(g.genre), 64, y + 16)

        const barX = 220
        const barW = (W - 220 - 120) * (g.minutes / max)
        ctx.fillStyle = '#1f232c'
        ctx.beginPath()
        ctx.roundRect(barX, y, W - 220 - 120, 20, 6)
        ctx.fill()
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0)
        grad.addColorStop(0, '#8a6420')
        grad.addColorStop(1, '#f5b544')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(barX, y, Math.max(barW, 4), 20, 6)
        ctx.fill()

        ctx.fillStyle = '#6d7186'
        ctx.font = '500 13px Inter, system-ui, sans-serif'
        ctx.fillText(formatTotalRuntime(g.minutes), W - 108, y + 16)
      })
    }

    // Footer
    ctx.fillStyle = '#6d7186'
    ctx.font = '400 13px Inter, system-ui, sans-serif'
    const year = new Date().getFullYear()
    ctx.fillText(`${library.length} tracked titles · ${year} · cinetrack`, 64, H - 52)

    setRendered(true)
  }

  const save = () => {
    const cv = canvasRef.current
    if (!cv) return
    const link = document.createElement('a')
    link.download = `cinetrack-${new Date().getFullYear()}.png`
    link.href = cv.toDataURL('image/png')
    link.click()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <motion.div
        className="relative w-[min(920px,94vw)] overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl"
        initial={{ scale: 0.96, y: 14 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Share your stats</h2>
            <p className="mt-0.5 text-xs text-ink-dim">
              Rendered locally from your library — nothing is uploaded anywhere.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition hover:border-gold hover:text-gold"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="w-full rounded-xl border border-line"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          {!rendered && (
            <button
              onClick={draw}
              className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-soft transition hover:text-ink"
            >
              Render card
            </button>
          )}
          <button
            onClick={() => {
              draw()
              save()
            }}
            disabled={!stats}
            className="rounded-lg border border-gold bg-gold px-4 py-2 text-xs font-semibold text-canvas transition hover:bg-gold-soft disabled:opacity-50"
          >
            Save PNG
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function subtitleFor(label: string, stats: Stats): string {
  switch (label) {
    case 'TITLES':
      return `${stats.byKind.movie} movies · ${stats.byKind.series} series`
    case 'COMPLETED':
      return `${stats.watching} watching now`
    case 'WATCH TIME':
      return 'of completed content'
    case 'AVG RATING':
      return 'across rated titles'
    default:
      return ''
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
