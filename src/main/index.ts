import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { createWindow, guardEmbeddedContents, setQuitting } from './window'
import { registerIpcHandlers } from './ipc'
import { initDatabase } from './db'
import { seedLocalCredentials } from './seed-credentials'
import { startNotificationEngine } from './notifications'
import { setupAdBlocker } from './adblock'
import { autoBackupOnQuit } from './backup'
import { getSetting } from './db/queries'

app.whenReady()
  .then(async () => {
    initDatabase()
    seedLocalCredentials()
    registerIpcHandlers()
    startNotificationEngine()

    // The streaming webview lives in its own webContents; block its popups
    // and ad redirects. Registered once for the whole app lifetime.
    guardEmbeddedContents()

    // Stand up the player-session ad blocker before any window loads, so the
    // first stream is already protected. Respect the persisted preference —
    // without this a user who turned blocking off got it re-enabled (and the
    // filter lists re-downloaded) on every launch.
    if (getSetting<boolean>('app.adBlock') !== false) {
      setupAdBlocker().catch((err) => console.error('[adblock] startup failed:', err))
    }

    const win = createWindow()

    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const w = createWindow()
        if (process.env['ELECTRON_RENDERER_URL']) {
          w.loadURL(process.env['ELECTRON_RENDERER_URL'])
        } else {
          w.loadFile(join(__dirname, '../renderer/index.html'))
        }
      }
    })
  })
  .catch((err) => {
    // A throw here (corrupt DB, unwritable userData) used to leave a zombie
    // process with no window and no way to diagnose. Show a dialog and exit.
    console.error('[main] startup failed:', err)
    dialog.showErrorBox(
      'CineTrack could not start',
      `${(err as Error)?.message ?? err}\n\nYour library file may be corrupt or unreadable.`
    )
    app.exit(1)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Flush an encrypted snapshot to the chosen folder on the way out, then let
// the window actually close. `setQuitting` has to run first: the close handler
// hides the window instead of destroying it, so without this flag app.quit()
// never gets past the window teardown.
app.on('before-quit', () => {
  setQuitting()
  autoBackupOnQuit()
})
