/**
 * Network-level ad & tracker blocking for the streaming embeds.
 *
 * The free providers monetize with popups, popunders, pre-rolls, and overlay
 * ads. Single-layer guards leak: the play button opens ay267.com / bblaa.com
 * in a browser even when one handler is patched, because providers chain
 * window.open, top-level navigation, and iframe redirects.
 *
 * This is the layered defense:
 *
 *   1. Ghostery/EasyList engine (this file) — cancels ad & tracking requests
 *      at the network layer before bytes reach the renderer, so ad scripts
 *      never execute and can never open anything.
 *   2. window.ts popup guard — denies any new window or navigation spawned
 *      from inside a provider frame.
 *
 * EasyList-style blocking is the only approach that scales: the filter lists
 * are maintained by the wider blocking community and cover the long tail of
 * ad/tracking domains a hand-written blocklist can't keep up with.
 *
 * IMPORTANT: the blocker is attached to a dedicated `persist:player` session,
 * NOT the default session. Attaching it to the default session would also
 * block ads inside TMDB pages and could break their image CDN; the app's own
 * UI must stay unaffected.
 */
import { session } from 'electron'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import fetch from 'cross-fetch'

/** The partition the streaming iframe lives in. Must match the WatchModal. */
export const PLAYER_PARTITION = 'persist:player'

let enabled = false
let blocker: ElectronBlocker | null = null

/**
 * Boots the blocker against the prebuilt ads+tracking list. Safe to call
 * once per session; later calls are no-ops.
 */
export async function setupAdBlocker(): Promise<void> {
  if (enabled) return
  const ses = session.fromPartition(PLAYER_PARTITION)

  try {
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
    blocker.enableBlockingInSession(ses)
    enabled = true
    console.log('[adblock] EasyList-grade blocking enabled on', PLAYER_PARTITION)
  } catch (err) {
    // A failed download must not take the player down — the popup guard in
    // window.ts still protects the user at the navigation layer.
    console.error('[adblock] failed to enable, falling back to popup guard only:', err)
  }
}

/** True once the network blocker is live. Used for the settings indicator. */
export function isAdBlockerEnabled(): boolean {
  return enabled
}

/**
 * Toggles the network filters at runtime. Disabling does not uninstall the
 * blocker object — it only removes its request listeners — so re-enabling is
 * cheap and needs no re-download.
 */
export async function setAdBlockerEnabled(on: boolean): Promise<void> {
  const ses = session.fromPartition(PLAYER_PARTITION)
  if (on) {
    if (!blocker) {
      await setupAdBlocker()
      return
    }
    blocker.enableBlockingInSession(ses)
    enabled = true
    console.log('[adblock] re-enabled')
  } else {
    if (blocker) blocker.disableBlockingInSession(ses)
    enabled = false
    console.log('[adblock] disabled by user')
  }
}
