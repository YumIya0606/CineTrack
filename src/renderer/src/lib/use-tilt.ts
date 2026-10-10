import { useCallback, useEffect, useRef, useState } from 'react'

export interface TiltStyle {
  transform: string
  transition: string
}

/**
 * Pointer-tracking 3D tilt. Returns props to spread onto a perspective-stage
 * element: the card leans toward the cursor with layered depth, then eases back
 * to flat when released.
 *
 * Callers decide whether to attach the handlers at all when reduce-motion is
 * on, so the hook itself stays free of store dependencies.
 */
export function useTilt(maxDeg = 9) {
  const [style, setStyle] = useState<TiltStyle>({ transform: '', transition: '' })
  const frame = useRef<number | null>(null)

  // Cancel any in-flight frame on unmount, otherwise a scheduled callback can
  // call setStyle on a component that's gone.
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    []
  )

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const el = e.currentTarget
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = null
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
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    setStyle({ transform: '', transition: 'transform 420ms cubic-bezier(0.16,1,0.3,1)' })
  }, [])

  return { style, onMove, onLeave }
}
