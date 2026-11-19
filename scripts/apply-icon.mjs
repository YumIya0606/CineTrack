/**
 * Embeds the brand icon and version metadata into the packaged executable.
 *
 * electron-builder applies these via rcedit, which it bundles inside the
 * winCodeSign toolkit. That toolkit's archive contains two macOS symlinks that
 * can't be extracted on a Windows account lacking the "Create symbolic links"
 * privilege, so packaging with signing enabled fails. We disable that step in
 * electron-builder.yml (signAndEditExecutable: false) and apply the icon here
 * with a locally vendored rcedit instead — no download, no privilege needed.
 *
 * This is called from scripts/after-pack.mjs so the NSIS installer contains the
 * branded executable. Running it manually after a build only patches
 * win-unpacked, which is too late for the installer.
 */
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

export function applyBranding(exe = join(root, 'release/win-unpacked/CineTrack.exe')) {
  const rcedit = join(root, 'resources/rcedit-x64.exe')
  const icon = join(root, 'resources/icon.ico')

  for (const f of [exe, rcedit, icon]) {
    if (!existsSync(f)) {
      console.warn(`[icon] skipping — ${f} not found (was packaging run?)`)
      return false
    }
  }

  // signAndEditExecutable is disabled, so electron-builder never writes the
  // version block either. Without this the shipped CineTrack.exe says
  // "Electron 35.7.5" in Explorer and on the taskbar tooltip.
  let version = '1.0.0'
  try {
    version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? version
  } catch {
    /* fall back to the declared version */
  }

  const out = spawnSync(
    rcedit,
    [
      exe,
      '--set-icon',
      icon,
      '--set-file-version',
      version,
      '--set-product-version',
      version,
      '--set-version-string',
      'ProductName',
      'CineTrack',
      '--set-version-string',
      'FileDescription',
      'CineTrack - movie & series tracker',
      '--set-version-string',
      'CompanyName',
      'CineTrack',
      '--set-version-string',
      'LegalCopyright',
      'Copyright (c) 2026 CineTrack'
    ],
    { encoding: 'utf8', windowsHide: true }
  )
  if (out.status !== 0) {
    console.warn('[icon] rcedit failed:', out.stderr?.trim() || out.stdout?.trim())
    return false
  }
  console.log(`[icon] branded ${exe}`)
  return true
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()
if (invokedDirectly) applyBranding()
