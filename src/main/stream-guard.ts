/**
 * The list of hosts that serve the free streaming embeds, plus the predicate
 * that decides whether a URL belongs to one of them. Kept pure (no Electron
 * imports) so the popup guard can be unit-tested without booting the app.
 *
 * Popups born inside one of these frames are provider ads — tracking
 * redirects and fake players — and must never be handed to the OS browser.
 */
export const STREAM_HOSTS = [
  'vidlink.pro',
  'multiembed.mov'
]

export function isStreamFrame(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname
    return STREAM_HOSTS.some(h => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}
