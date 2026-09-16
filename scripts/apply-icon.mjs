/**
 * Embeds the brand icon into the packaged executable.
 *
 * electron-builder applies the icon via rcedit, which it bundles inside the
 * winCodeSign toolkit. That toolkit's archive contains two macOS symlinks that
 * can't be extracted on a Windows account lacking the "Create symbolic links"
 * privilege, so packaging with signing enabled fails. We disable that step in
 * electron-builder.yml (signAndEditExecutable: false) and apply the icon here
 * with a locally vendored rcedit instead — no download, no privilege needed.
 */
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function main() {
  const exe = join(root, 'release/win-unpacked/CineTrack.exe')
  const rcedit = join(root, 'resources/rcedit-x64.exe')
  const icon = join(root, 'resources/icon.ico')

  for (const f of [exe, rcedit, icon]) {
    if (!existsSync(f)) {
      console.warn(`[icon] skipping — ${f} not found (was packaging run?)`)
      return
    }
  }

  const out = spawnSync(rcedit, [exe, '--set-icon', icon], {
    encoding: 'utf8',
    windowsHide: true
  })
  if (out.status !== 0) {
    console.warn('[icon] rcedit failed:', out.stderr?.trim() || out.stdout?.trim())
    return
  }
  console.log('[icon] embedded brand icon into CineTrack.exe')
}

main()
