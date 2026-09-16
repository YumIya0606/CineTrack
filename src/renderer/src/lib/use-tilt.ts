import { useCallback, useRef, useState } from 'react'

export interface TiltStyle {
  transform: string
  transition: string
}

/**
 * Pointer-tracking 3D tilt. Returns props to spread onto a perspective-stage
 * element: the card leans toward the cursor with layered depth, then eases back
 * to flat when released. Honors the reduce-motion flag so it never fights
 * accessibility settings.
 */
export function useTilt(maxDeg = 9) {
  const [style, setStyle] = useState<TiltStyle>({ transform: '', transition: '' })
  const frame = useRef<number | null>(null)

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const el = e.currentTarget
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const px = (e.clientX - rect.left) / rect.width
        const py = (e.clientY - rect.top) / rect.height
        const rotateY = (px - 0.5) * 2 * maxDeg
        const rotateX = (0.5 - py) * 2 * maxDeg
        setStyle({
          transform: `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(1.04)`,
          transition: 'transform 80ms linear'
        })
      })
    },
    [maxDeg]
  )

  const onLeave = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current)
    setStyle({ transform: '', transition: 'transform 420ms cubic-bezier(0.16,1,0.3,1)' })
  }, [])

  return { style, onMove, onLeave }
}
