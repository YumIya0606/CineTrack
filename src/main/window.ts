import { app, BrowserWindow, shell, nativeImage } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'

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
      webSecurity: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    if (isDev) win.webContents.openDevTools({ mode: 'detach' })
  })

  win.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.on('close', e => {
    e.preventDefault()
    win.hide()
  })

  app.on('before-quit', () => {
    win.removeAllListeners('close')
    win.destroy()
  })

  return win
}
