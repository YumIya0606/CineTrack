/** Runs inside electron-builder after unpacking, before the NSIS target. */
import { join } from 'path'
import { applyBranding } from './apply-icon.mjs'

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  applyBranding(join(context.appOutDir, 'CineTrack.exe'))
}
