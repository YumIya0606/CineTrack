import { app, BrowserWindow, shell, nativeImage } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { isStreamFrame } from './stream-guard'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const isDev = !app.isPackaged

export function createWindow(): BrowserWindow {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0c0f',
    title: 'CineTrack',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // The watch modal renders providers in a <webview> so it can run in the
      // ad-blocked `persist:player` partition, isolated from the app session.
      webviewTag: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    if (isDev) win.webContents.openDevTools({ mode: 'detach' })
  })

  win.webContents.setWindowOpenHandler(details => {
    // Popups born inside a streaming embed are provider ads (tracking
    // redirects, fake players). Drop them in-place — never hand them to the
    // OS browser, which is what launched Edge behind the user's back.
    if (isStreamFrame(details.referrer?.url)) {
      return { action: 'deny' }
    }
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Providers also weaponize top-level navigation: some play buttons call
  // location.href = adUrl rather than window.open. Guard the main frame the
  // same way, but only for navigations that leave a streaming embed.
  win.webContents.on('will-navigate', (_e, url) => {
    if (isStreamFrame(win.webContents.getURL()) || isStreamFrame(url)) {
      _e.preventDefault()
    }
  })

// The X button hides to a tray-like "closed" state instead of quitting.
  // `isQuitting` is flipped in before-quit so a real quit tears the window
  // down; without it close is *always* prevented, window-all-closed never
  // fires, and app.quit() is unreachable — the app becomes unquittable.
  win.on('close', e => {
    if (isQuitting) return
    e.preventDefault()
    win.hide()
  })

  return win
}

/**
 * Hardening for every non-window webContents — chiefly the provider <webview>
 * in the watch modal. Deny every popup it spawns and block navigations and
 * redirects to any origin that isn't a known provider (this is what stops the
 * ay267.com / bblaa.com pop-unders).
 *
 * Registered ONCE from index.ts, not per window: an app-level listener added
 * inside createWindow() leaks on every macOS activate and would attach to all
 * later windows too, killing their link navigation.
 */
export function guardEmbeddedContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.isDestroyed()) return
    // Devtools are also webContents and must keep navigating freely.
    if (contents.getType() === 'webview' || contents.getType() === 'browserView') {
      contents.setWindowOpenHandler(() => ({ action: 'deny' }))
      contents.on('will-navigate', (e, url) => {
        if (!isStreamFrame(url)) e.preventDefault()
      })
      contents.on('will-redirect', (e, url) => {
        if (!isStreamFrame(url)) e.preventDefault()
      })
    }
  })
}

/** Set by index.ts before quitting so the close handler lets go of the window. */
let isQuitting = false
export function setQuitting(): void {
  isQuitting = true
}
