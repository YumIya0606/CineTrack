import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { setQuitting } from './window'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

let tray: Tray | null = null

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../resources/icon.png')
}

/** Brings the hidden window back. Also used for second-instance launches. */
export function showMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function toggleMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isVisible() && !win.isMinimized()) win.hide()
  else showMainWindow()
}

/**
 * The window's X button hides instead of quitting so notifications and the
 * local database stay alive. Without a tray icon that state was a trap: the
 * hidden window vanished from the taskbar and there was no way to reopen or
 * quit the app except Task Manager. The tray is the missing half of that
 * design, so closing stays cheap but is always reversible.
 */
export function setupTray(): void {
  if (tray) return

  try {
    const image = nativeImage.createFromPath(iconPath())
    const icon = image.isEmpty() ? undefined : image.resize({ width: 16, height: 16 })
    tray = new Tray(icon ?? image)
  } catch (err) {
    // A missing icon must not stop the app from starting. The close handler
    // still hides, so log loudly and keep the process usable.
    console.error('[tray] could not create tray icon:', err)
    return
  }

  tray.setToolTip('CineTrack')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open CineTrack', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: 'Quit CineTrack',
        click: () => {
          setQuitting()
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => toggleMainWindow())
  tray.on('double-click', () => showMainWindow())
}
