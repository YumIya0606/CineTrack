import { describe, it, expect } from 'vitest'

/*
 * Regression guard for a bug that made subtitles look completely broken.
 *
 * The subtitle settings auto-save effect fired the moment the Settings panel
 * opened, writing its initial empty state over whatever was stored. Both the
 * read and the write are async IPC, so when the write won the race the read
 * returned null and the user's API key was destroyed. The next search then
 * found nothing — and because provider errors were swallowed, all the user was
 * shown was "No IMDb id for this title", which pointed at the wrong cause.
 *
 * The gate that fixes it is `subsLoaded`: don't write until the read has landed.
 */

interface Store {
  get(key: string): Promise<string | null>
  /** Mirrors the real call: an empty field is normalised to null. */
  set(key: string, value: string | null): Promise<void>
}

function makeStore(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial))
  const store: Store & { data: Map<string, string> } = {
    data,
    // Slow read: this ordering is what lost the key.
    async get(key) {
      await new Promise(r => setTimeout(r, 10))
      return data.get(key) ?? null
    },
    async set(key, value) {
      await new Promise(r => setTimeout(r, 0))
      if (value === null || value === '') data.delete(key)
      else data.set(key, value)
    }
  }
  return store
}

/**
 * The load-then-gated-save sequence as SettingsOverlay performs it.
 * `saveEffect` runs on open and again whenever the user edits.
 */
function mountSettings(store: Store) {
  let key = ''
  let loaded = false

  const load = Promise.all([
    store.get('subtitles.subdlKey'),
    store.get('subtitles.opensubtitlesKey')
  ]).then(([subdl, os]) => {
    if (subdl) key = subdl
    void os
    loaded = true
  })

  // The save effect. `loaded` is the guard added by the fix.
  const saveEffect = () => {
    if (!loaded) return null
    return store.set('subtitles.subdlKey', key || null)
  }

  return {
    load,
    saveEffect,
    type: (v: string) => {
      key = v
    },
    isLoaded: () => loaded,
    current: () => key
  }
}

describe('subtitle settings auto-save race', () => {
  it('ungated save on open destroys a stored key (the original bug)', async () => {
    const store = makeStore({ 'subtitles.subdlKey': 'SECRET-KEY-123' })

    // Pre-fix behaviour: the effect ran immediately, with state still empty.
    // The write lands before the read, so the key is gone.
    const write = store.set('subtitles.subdlKey', null)
    const read = store.get('subtitles.subdlKey')
    await Promise.all([write, read])

    expect(store.data.has('subtitles.subdlKey')).toBe(false)
  })

  it('gated save preserves a stored key across opening Settings', async () => {
    const store = makeStore({ 'subtitles.subdlKey': 'SECRET-KEY-123' })
    const ui = mountSettings(store)

    // Save effect fires on open — but the gate holds it.
    expect(ui.saveEffect()).toBeNull()

    await ui.load
    expect(ui.isLoaded()).toBe(true)
    expect(ui.current()).toBe('SECRET-KEY-123')

    // Now that state is real, saving writes the same value back.
    await ui.saveEffect()
    expect(store.data.get('subtitles.subdlKey')).toBe('SECRET-KEY-123')
  })

  it('saves a newly typed key once the gate has opened', async () => {
    const store = makeStore({ 'subtitles.subdlKey': 'OLD' })
    const ui = mountSettings(store)
    await ui.load

    ui.type('NEW-KEY')
    await ui.saveEffect()
    expect(store.data.get('subtitles.subdlKey')).toBe('NEW-KEY')
  })

  it('clears the key when the user deliberately blanks the field', async () => {
    const store = makeStore({ 'subtitles.subdlKey': 'SECRET-KEY-123' })
    const ui = mountSettings(store)
    await ui.load

    ui.type('')
    await ui.saveEffect()
    expect(store.data.has('subtitles.subdlKey')).toBe(false)
  })

  it('reopening Settings repeatedly never loses the key', async () => {
    const store = makeStore({ 'subtitles.subdlKey': 'SECRET-KEY-123' })

    for (let i = 0; i < 5; i++) {
      const ui = mountSettings(store)
      ui.saveEffect() // fires on open, gated
      await ui.load
      await ui.saveEffect()
    }

    expect(store.data.get('subtitles.subdlKey')).toBe('SECRET-KEY-123')
  })
})