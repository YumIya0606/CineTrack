/**
 * The CineTrack mark: a play triangle inside a tilted aperture ring, with a
 * tracked title riding the orbit. Matches resources/icon.svg exactly so the
 * in-app brand stays identical to the taskbar/packaged icon.
 */
export default function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <g transform="rotate(-22 256 256)">
        <ellipse
          cx="256"
          cy="256"
          rx="180"
          ry="78"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          opacity="0.45"
        />
      </g>
      <path d="M170 148 L170 364 L382 256 Z" fill="currentColor" />
      <circle cx="423" cy="218" r="16" fill="currentColor" opacity="0.9" />
    </svg>
  )
}
