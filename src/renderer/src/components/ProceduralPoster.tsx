import { useMemo } from 'react'
import { initials } from '@shared/utils'

interface ProceduralPosterProps {
  title: string
  year?: number | null
  seed?: number
  className?: string
}

/**
 * Deterministic procedural poster art. Looks intentional (not like a broken
 * image) and gives the fully-offline experience a polished feel.
 */
function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const PALETTES: [string, string, string][] = [
  ['#f5b544', '#8a3b12', '#1a0f08'],
  ['#e84855', '#5a1420', '#160a0d'],
  ['#3ecf8e', '#0f4d3a', '#06160f'],
  ['#5b8def', '#1c2f63', '#080d1a'],
  ['#b07ce8', '#3a1d63', '#100a1a'],
  ['#f072a1', '#5a1438', '#170a12'],
  ['#4cc9d8', '#0f4a52', '#051518'],
  ['#f9c74f', '#8a5a12', '#1a1206']
]

export default function ProceduralPoster({
  title,
  year,
  seed,
  className
}: ProceduralPosterProps) {
  const { gradient, accent, pattern } = useMemo(() => {
    const h = hashString(seed !== undefined ? `${seed}` : title)
    const palette = PALETTES[h % PALETTES.length]!
    const angle = 115 + (h % 50)
    return {
      gradient: `linear-gradient(${angle}deg, ${palette[0]} 0%, ${palette[1]} 48%, ${palette[2]} 100%)`,
      accent: palette[0],
      pattern: h % 3
    }
  }, [title, seed])

  const init = initials(title)

  return (
    <div
      className={className}
      style={{
        background: gradient,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '10%'
      }}
    >
      {/* Decorative ring pattern */}
      <svg
        viewBox="0 0 100 100"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.16 }}
        aria-hidden
      >
        {pattern === 0 && (
          <>
            <circle cx="78" cy="22" r="34" fill="none" stroke="#fff" strokeWidth="0.7" />
            <circle cx="78" cy="22" r="22" fill="none" stroke="#fff" strokeWidth="0.7" />
          </>
        )}
        {pattern === 1 && (
          <>
            <rect x="18" y="14" width="64" height="72" rx="6" fill="none" stroke="#fff" strokeWidth="0.8" />
            <line x1="30" y1="30" x2="70" y2="30" stroke="#fff" strokeWidth="0.8" />
            <line x1="30" y1="42" x2="70" y2="42" stroke="#fff" strokeWidth="0.8" />
          </>
        )}
        {pattern === 2 && (
          <>
            <path d="M8 88 L34 34 L60 66 L92 12" fill="none" stroke="#fff" strokeWidth="1.1" />
            <circle cx="34" cy="34" r="3.4" fill="#fff" />
          </>
        )}
      </svg>

      <div
        style={{
          fontSize: '2.2em',
          fontWeight: 800,
          color: '#fff',
          textShadow: '0 2px 12px rgba(0,0,0,0.45)',
          lineHeight: 1,
          fontFamily: 'Sora, system-ui, sans-serif'
        }}
      >
        {init}
      </div>
      <div>
        <div
          style={{
            fontSize: '0.92em',
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            fontFamily: 'Sora, system-ui, sans-serif',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {title}
        </div>
        {year ? (
          <div style={{ fontSize: '0.72em', color: accent, fontWeight: 700, marginTop: '0.28em' }}>
            {year}
          </div>
        ) : null}
      </div>
    </div>
  )
}
