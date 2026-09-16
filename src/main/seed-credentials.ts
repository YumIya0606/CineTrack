import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { getSetting, setSetting } from './db/queries'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

interface KeyFile {
  readToken?: string | null
  apiKey?: string | null
}

/**
 * Seeds TMDB credentials from a local `cinetrack.key.json` sitting at the
 * project root. The file is gitignored, so this is a dev-machine convenience —
 * packaged builds get their key through the Settings overlay instead.
 *
 * Existing settings are never overwritten, so anything entered in Settings wins.
 */
export function seedLocalCredentials(): void {
  const keyPath = join(__dirname, '../../cinetrack.key.json')
  if (!existsSync(keyPath)) return

  let keyFile: KeyFile
  try {
    keyFile = JSON.parse(readFileSync(keyPath, 'utf8')) as KeyFile
  } catch {
    console.warn('[credentials] cinetrack.key.json is unreadable — skipping')
    return
  }

  if (keyFile.readToken && !getSetting<string>('tmdb.readToken')) {
    setSetting('tmdb.readToken', keyFile.readToken)
  }
  if (keyFile.apiKey && !getSetting<string>('tmdb.apiKey')) {
    setSetting('tmdb.apiKey', keyFile.apiKey)
  }
}
