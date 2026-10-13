import { describe, it, expect } from 'vitest'
import { normalizePlayerMessage } from './playerSync'

/*
 * These payloads come from third-party embed players with no contract. The
 * failure mode that matters is a message we half-understand: we would place
 * subtitles at a nonsense offset, or worse, accrue watch time from noise. So
 * the tests below are mostly about what must be REJECTED.
 */

describe('normalizePlayerMessage — known shapes', () => {
  it('reads MovieSap (moviesapi-player)', () => {
    const n = normalizePlayerMessage({
      source: 'moviesapi-player',
      event: 'timeupdate',
      currentTime: 42.5,
      duration: 8700,
      percentage: 0.5
    })
    expect(n?.source).toBe('MovieSap')
    expect(n?.event).toBe('timeupdate')
    expect(n?.currentTime).toBeCloseTo(42.5)
    expect(n?.duration).toBeCloseTo(8700)
  })

  it('reads CineSrc namespaced events', () => {
    const n = normalizePlayerMessage({
      type: 'cinesrc:timeupdate',
      currentTime: 10,
      duration: 100
    })
    expect(n?.source).toBe('CineSrc')
    expect(n?.event).toBe('timeupdate')
    expect(n?.currentTime).toBe(10)
  })

  it('reads a flat generic message (Vidlove / Vidzen / Vidlink shape)', () => {
    const n = normalizePlayerMessage({ event: 'timeupdate', currentTime: 7, duration: 60 })
    expect(n?.source).toBe('generic')
    expect(n?.currentTime).toBe(7)
  })

  it('reads a message nested under data', () => {
    const n = normalizePlayerMessage({
      type: 'PLAYER_EVENT',
      data: { event: 'timeupdate', currentTime: 3, duration: 30 }
    })
    expect(n?.event).toBe('timeupdate')
    expect(n?.currentTime).toBe(3)
  })

  it('accepts a JSON string payload', () => {
    const n = normalizePlayerMessage(
      JSON.stringify({ event: 'timeupdate', currentTime: 12.25, duration: 99 })
    )
    expect(n?.currentTime).toBeCloseTo(12.25)
  })

  it('accepts alternate field spellings', () => {
    expect(normalizePlayerMessage({ time: 5, total_duration: 20 })?.currentTime).toBe(5)
    expect(normalizePlayerMessage({ position: 8, duration: 20 })?.currentTime).toBe(8)
    expect(normalizePlayerMessage({ current_time: 9, duration: 20 })?.currentTime).toBe(9)
  })

  it('accepts a percent-only message and leaves currentTime null', () => {
    const n = normalizePlayerMessage({ progress: 25, duration: 200 })
    expect(n?.percent).toBe(25)
    expect(n?.currentTime).toBeNull()
  })

  it('reads play and pause state', () => {
    expect(normalizePlayerMessage({ event: 'play', currentTime: 0 })?.event).toBe('play')
    expect(normalizePlayerMessage({ event: 'pause', currentTime: 0 })?.event).toBe('pause')
    expect(normalizePlayerMessage({ event: 'ended', currentTime: 0 })?.event).toBe('ended')
  })
})

describe('normalizePlayerMessage — must be rejected', () => {
  it('rejects null, undefined and non-objects', () => {
    expect(normalizePlayerMessage(null)).toBeNull()
    expect(normalizePlayerMessage(undefined)).toBeNull()
    expect(normalizePlayerMessage(42)).toBeNull()
    expect(normalizePlayerMessage(true)).toBeNull()
  })

  it('rejects a message with no positional information at all', () => {
    // This is the dangerous case: an ad SDK or analytics beacon in the same
    // window. Treating it as a sync event would teleport the overlay.
    expect(normalizePlayerMessage({ event: 'click', target: 'ad-container' })).toBeNull()
    expect(normalizePlayerMessage({ type: 'ready' })).toBeNull()
  })

  it('rejects non-numeric position fields rather than coercing them', () => {
    expect(normalizePlayerMessage({ currentTime: '42', duration: '100' })).toBeNull()
    expect(normalizePlayerMessage({ currentTime: null, duration: undefined })).toBeNull()
  })

  it('rejects NaN and Infinity', () => {
    expect(normalizePlayerMessage({ currentTime: NaN, duration: Infinity })).toBeNull()
  })

  it('rejects a malformed JSON string instead of throwing', () => {
    expect(normalizePlayerMessage('{not json')).toBeNull()
    expect(normalizePlayerMessage('')).toBeNull()
  })

  it('rejects an array, which is a common analytics payload', () => {
    expect(normalizePlayerMessage([1, 2, 3])).toBeNull()
  })
})