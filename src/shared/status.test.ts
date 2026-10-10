import { describe, it, expect } from 'vitest'
import {
  deriveSeriesStatus,
  isAutoStatus,
  resolveStatus,
  progressOf,
  statusKeyFromLabel,
  fallbackLabel
} from './status'

const DERIVABLE = new Set(['watching', 'planned', 'completed'])

describe('deriveSeriesStatus', () => {
  it('maps episode progress onto the three progress statuses', () => {
    expect(deriveSeriesStatus(0, 20)).toBe('planned')
    expect(deriveSeriesStatus(1, 20)).toBe('watching')
    expect(deriveSeriesStatus(19, 20)).toBe('watching')
    expect(deriveSeriesStatus(20, 20)).toBe('completed')
  })

  it('completes once logged episodes reach or pass the total', () => {
    // A bulk import seeds the full count, so over-counting is possible.
    expect(deriveSeriesStatus(21, 20)).toBe('completed')
  })

  it('returns null when the episode total is unknown', () => {
    // Nothing to derive from — the status stays whatever the user set.
    expect(deriveSeriesStatus(5, null)).toBeNull()
    expect(deriveSeriesStatus(0, 0)).toBeNull()
  })
})

describe('isAutoStatus', () => {
  it('only auto-manages series with a known episode total', () => {
    expect(isAutoStatus({ kind: 'series', episodesTotal: 20, statusOverride: false })).toBe(true)
    expect(isAutoStatus({ kind: 'series', episodesTotal: null, statusOverride: false })).toBe(false)
    expect(isAutoStatus({ kind: 'movie', episodesTotal: null, statusOverride: false })).toBe(false)
  })

  it('respects a manual override', () => {
    expect(isAutoStatus({ kind: 'series', episodesTotal: 20, statusOverride: true })).toBe(false)
  })
})

describe('resolveStatus', () => {
  const base = {
    kind: 'series',
    episodesTotal: 20,
    statusOverride: false,
    currentStatus: 'planned',
    requested: null as string | null,
    derivableKeys: DERIVABLE
  }

  it('follows progress for an auto-managed series', () => {
    expect(resolveStatus({ ...base, episodesWatched: 5 })).toEqual({
      status: 'watching',
      override: false
    })
    expect(resolveStatus({ ...base, episodesWatched: 20 })).toEqual({
      status: 'completed',
      override: false
    })
  })

  it('pins an explicit user choice and marks it as an override', () => {
    expect(
      resolveStatus({ ...base, episodesWatched: 5, requested: 'dropped' })
    ).toEqual({ status: 'dropped', override: true })
  })

  it('keeps a pinned status even as progress advances', () => {
    // The engine must never fight a deliberate choice.
    expect(
      resolveStatus({ ...base, episodesWatched: 20, statusOverride: true, currentStatus: 'dropped' })
    ).toEqual({ status: 'dropped', override: true })
  })

  it('leaves movies fully manual', () => {
    expect(
      resolveStatus({ ...base, kind: 'movie', episodesTotal: null, episodesWatched: 0 })
    ).toEqual({ status: 'planned', override: false })
  })

  it('does not assign a status the user has un-declared as auto', () => {
    // If "planned" is no longer auto-assignable, an untouched series keeps its
    // current status instead of being silently rewritten.
    expect(
      resolveStatus({
        ...base,
        episodesWatched: 0,
        derivableKeys: new Set(['watching', 'completed'])
      })
    ).toEqual({ status: 'planned', override: false })
  })
})

describe('progressOf', () => {
  it('returns a 0..1 fraction, clamped', () => {
    expect(progressOf({ episodesWatched: 0, episodesTotal: 20 })).toBe(0)
    expect(progressOf({ episodesWatched: 5, episodesTotal: 20 })).toBe(0.25)
    expect(progressOf({ episodesWatched: 40, episodesTotal: 20 })).toBe(1)
  })

  it('is null without a total', () => {
    expect(progressOf({ episodesWatched: 5, episodesTotal: null })).toBeNull()
    expect(progressOf({ episodesWatched: 5, episodesTotal: 0 })).toBeNull()
  })
})

describe('statusKeyFromLabel', () => {
  it('slugifies a label', () => {
    expect(statusKeyFromLabel('On Hold')).toBe('on_hold')
    expect(statusKeyFromLabel('Rewatch Someday')).toBe('rewatch_someday')
    expect(statusKeyFromLabel('Rewatching!')).toBe('rewatching')
  })

  it('never returns an empty key', () => {
    expect(statusKeyFromLabel('***')).toBe('custom')
    expect(statusKeyFromLabel('   ')).toBe('custom')
  })
})

describe('fallbackLabel', () => {
  it('turns an unknown key into a readable label', () => {
    expect(fallbackLabel('on_hold')).toBe('On hold')
    expect(fallbackLabel('')).toBe('Unknown')
  })
})