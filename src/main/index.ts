import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDatabase } from './db'
import { seedLocalCredentials } from './seed-credentials'
import { startNotificationEngine } from './notifications'

app.whenReady().then(() => {
  initDatabase()
  seedLocalCredentials()
  registerIpcHandlers()
  startNotificationEngine()

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
