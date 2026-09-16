/**
 * Pre-extracts electron-builder's winCodeSign cache without symlink support
 * (7za -snl copies instead of linking), so packaging works on Windows accounts
 * that lack the "Create symbolic links" privilege.
 *
 * Run before `electron-builder` in the package script.
 */
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sevenZip = join(__dirname, '../node_modules/7zip-bin/win/x64/7za.exe')
const cacheRoot = join(process.env['LOCALAPPDATA'] ?? '', 'electron-builder/Cache/winCodeSign')

function main() {
  if (!existsSync(cacheRoot)) {
    console.log('[codesign-fix] no winCodeSign cache yet, nothing to pre-populate')
    return
  }

  // The hash directory name changes per build; extract every archive present
  // and also handle ones that appear moments before the build runs.
  const archives = readdirSafe(cacheRoot).filter(f => f.endsWith('.7z'))
  for (const arc of archives) {
    const dir = join(cacheRoot, arc.replace(/\.7z$/, ''))
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const out = spawnSync(sevenZip, ['x', join(cacheRoot, arc), `-o${dir}`, '-y', '-snl'], {
      encoding: 'utf8',
      windowsHide: true
    })
    if (out.status === 0) {
      console.log(`[codesign-fix] extracted ${arc}`)
    } else {
      console.warn(`[codesign-fix] ${arc} failed (may already be extracted)`)
    }
  }
}

function readdirSafe(p) {
  try {
    const fs = require('fs')
    return fs.readdirSync(p)
  } catch {
    return []
  }
}

main()
