import { describe, it, expect } from 'vitest'
import { isStreamFrame, STREAM_HOSTS } from './stream-guard'

describe('isStreamFrame', () => {
  it('recognizes every configured provider host', () => {
    for (const host of STREAM_HOSTS) {
      expect(isStreamFrame(`https://${host}/embed/movie/603`)).toBe(true)
    }
  })

  it('recognizes provider URLs with paths, queries and fragments', () => {
    expect(isStreamFrame('https://vidlink.pro/tv/1396/1/1')).toBe(true)
    expect(isStreamFrame('https://vidlink.pro/movie/27205')).toBe(true)
    expect(isStreamFrame('https://multiembed.mov/?video_id=603&tmdb=1')).toBe(true)
    expect(isStreamFrame('https://multiembed.mov/?video_id=1396&tmdb=1&s=1&e=1#t=120')).toBe(true)
  })

  it('recognizes subdomains of a provider host', () => {
    expect(isStreamFrame('https://cdn.vidlink.pro/movie/603')).toBe(true)
    expect(isStreamFrame('https://m.multiembed.mov/?video_id=603')).toBe(true)
  })

  it('blocks the exact ad/tracker hosts the providers spawn', () => {
    // Real tracking popup captured from a provider play button.
    expect(
      isStreamFrame(
        'https://ay267.com/?rb=vF05C5PQgSC0zu51&pl=https%3A%2F%2Fvidlink.pro%2Fmovie%2F969681'
      )
    ).toBe(false)
  })

  it('treats non-provider origins as safe to open externally', () => {
    expect(isStreamFrame('https://www.themoviedb.org/movie/603-matrix')).toBe(false)
    expect(isStreamFrame('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
    expect(isStreamFrame('http://localhost:5173/')).toBe(false)
  })

  it('handles malformed and empty input without throwing', () => {
    expect(isStreamFrame(undefined)).toBe(false)
    expect(isStreamFrame(null)).toBe(false)
    expect(isStreamFrame('')).toBe(false)
    expect(isStreamFrame('not a url')).toBe(false)
    expect(isStreamFrame('http://')).toBe(false)
  })

  it('does not false-positive on lookalike hosts', () => {
    // A host that merely contains a provider name as a substring must not
    // be treated as a streaming frame.
    expect(isStreamFrame('https://vidlink.pro.evil.com/movie/603')).toBe(false)
    expect(isStreamFrame('https://notvidlink.pro/movie/603')).toBe(false)
    expect(isStreamFrame('https://multiembed.mov.attacker.net/')).toBe(false)
  })
})
