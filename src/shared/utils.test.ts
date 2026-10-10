import { describe, it, expect } from 'vitest'
import { catalogKey, parseTitleLines, distributeWatchedDate, hashString } from './utils'

describe('catalogKey', () => {
  it('uniquely keys live TMDB rows, which all share id 0', () => {
    // tmdbToCatalog deliberately returns id: 0 for every live result — keying a
    // list on item.id folds them all into key "0" and React warns about
    // duplicate children.
    const live = [
      { id: 0, tmdbId: 27205, title: 'Inception', year: 2010 },
      { id: 0, tmdbId: 603, title: 'The Matrix', year: 1999 },
      { id: 0, tmdbId: 1396, title: 'Breaking Bad', year: 2008 }
    ]
    const keys = live.map(catalogKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(['t27205', 't603', 't1396'])
  })

  it('keys persisted catalog rows by their database id when they have no tmdbId', () => {
    expect(catalogKey({ id: 42, tmdbId: null, title: 'Bundled film', year: 1995 })).toBe('d42')
  })

  it('prefers tmdbId over a colliding database id', () => {
    expect(catalogKey({ id: 7, tmdbId: 603, title: 'The Matrix', year: 1999 })).toBe('t603')
  })

  it('falls back to a title+year composite when neither id is present', () => {
    expect(catalogKey({ id: 0, tmdbId: null, title: 'Unknown', year: 2000 })).toBe(
      'sunknown:2000'
    )
  })

  it('never produces an undefined or empty key', () => {
    expect(catalogKey({ id: 0, tmdbId: null, title: '', year: null })).toBe('s:0')
  })
})

describe('parseTitleLines', () => {
  it('keeps plain one-per-line titles', () => {
    expect(parseTitleLines('Inception\nThe Matrix\n')).toEqual([
      { title: 'Inception', year: null },
      { title: 'The Matrix', year: null }
    ])
  })

  it('extracts a trailing (YYYY) as the year', () => {
    expect(parseTitleLines('Inception (2010)')).toEqual([{ title: 'Inception', year: 2010 }])
  })

  it('keeps a year range intact as the start year', () => {
    expect(parseTitleLines('Breaking Bad (2008–2013)')).toEqual([
      { title: 'Breaking Bad', year: 2008 }
    ])
  })

  it('strips numbered and bulleted list furniture', () => {
    const out = parseTitleLines('1. Heat\n2) The Godfather\n• Oldboy\n- Seven')
    expect(out.map(o => o.title)).toEqual(['Heat', 'The Godfather', 'Oldboy', 'Seven'])
  })

  it('rewrites "Title, The" into reading order', () => {
    expect(parseTitleLines('Matrix, The (1999)')).toEqual([{ title: 'The Matrix', year: 1999 }])
  })

  it('unquotes and collapses whitespace, and drops blank lines', () => {
    expect(parseTitleLines('"  Amélie   (2001)"\n\n   \n')).toEqual([
      { title: 'Amélie', year: 2001 }
    ])
  })

  it('ignores note columns after a tab', () => {
    expect(parseTitleLines('Parasite\twatched at the cinema')).toEqual([
      { title: 'Parasite', year: null }
    ])
  })

  it('returns nothing for an empty blob', () => {
    expect(parseTitleLines('   \n\n  ')).toEqual([])
  })
})

describe('distributeWatchedDate', () => {
  const now = new Date('2026-09-19T12:00:00Z')

  it('is deterministic for the same title — a re-import keeps its date', () => {
    const a = distributeWatchedDate('Inception', 12, now)
    const b = distributeWatchedDate('Inception', 12, now)
    expect(a).toBe(b)
  })

  it('spreads different titles across different days, not all to one date', () => {
    const dates = ['Heat', 'Oldboy', 'Seven', 'Amélie', 'Whiplash'].map(t =>
      distributeWatchedDate(t, 12, now)
    )
    expect(new Set(dates).size).toBeGreaterThan(1)
  })

  it('never lands outside the requested window', () => {
    for (let i = 0; i < 40; i++) {
      const d = new Date(distributeWatchedDate(`title-${i}`, 3, now))
      const daysAgo = (now.getTime() - d.getTime()) / 86400000
      expect(daysAgo).toBeGreaterThanOrEqual(0)
      expect(daysAgo).toBeLessThanOrEqual(3 * 30.44 + 1)
    }
  })

  it('returns "now" when the window is disabled', () => {
    expect(distributeWatchedDate('Anything', 0, now)).toBe(now.toISOString())
  })
})

describe('hashString', () => {
  it('produces different hashes for different inputs', () => {
    expect(hashString('Inception')).not.toBe(hashString('Interstellar'))
  })

  it('is stable across calls', () => {
    expect(hashString('CineTrack')).toBe(hashString('CineTrack'))
  })
})
