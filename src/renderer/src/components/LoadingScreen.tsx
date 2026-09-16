import { motion } from 'framer-motion'
import { useUI } from '../store'

/**
 * Branded loading curtain shown while the library boots — the "curtain rise"
 * of the cinema.
 */
export default function LoadingScreen() {
  const loading = useUI(s => s.loading)
  if (!loading) return null

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0c0f] via-[#0e1014] to-[#0b0c0f]" />

      {/* Logo with a slow rotating conic spotlight ring */}
      <div className="relative flex h-28 w-28 items-center justify-center">
        <div
          className="absolute inset-0 rounded-3xl opacity-60 blur-md"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, rgba(245,181,68,0.55) 40deg, transparent 110deg, transparent 360deg)',
            animation: 'sweep 2.6s linear infinite'
          }}
        />
        <div className="absolute inset-[3px] rounded-3xl bg-canvas" />
        <motion.div
          className="absolute inset-3 rounded-2xl bg-gradient-to-br from-gold/90 to-gold-dim shadow-glow"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <svg viewBox="0 0 100 100" className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)] p-6">
          <path d="M30 22 L30 78 L70 50 Z" fill="#0b0c0f" />
        </svg>
      </div>

      <h1 className="mt-7 font-display text-4xl font-bold tracking-tight text-gradient-gold">
        CineTrack
      </h1>
      <p className="mt-2 text-sm text-ink-dim">Preparing your library…</p>

      <div className="mt-6 h-[3px] w-52 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full w-1/2 animate-[shimmer_1.4s_infinite] rounded-full bg-gradient-to-r from-transparent via-gold to-transparent" />
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </motion.div>
  )
}
