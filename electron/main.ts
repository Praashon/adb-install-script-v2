import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initializeDatabase } from '@core/database/connection'
import { EventBus } from '@core/event-bus/eventBus'
import { JobRunner } from '@core/job-manager/jobRunner'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'adb-installer.db')

  const database = initializeDatabase(dbPath)
  const eventBus = new EventBus()
  const jobRunner = new JobRunner(database, eventBus)

  registerIpcHandlers(database, eventBus, jobRunner)

  eventBus.onAny((event, data) => {
    mainWindow?.webContents.send('event-bus:message', { event, data })
  })

  await jobRunner.recoverPendingJobs()

  // Start extension socket server
  const net = require('net')
  const server = net.createServer((socket: any) => {
    socket.on('data', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        if (message.action === 'install' && message.url) {
          database.jobs.create(message.url)
          jobRunner.start()
          socket.write(JSON.stringify({ success: true, message: 'Job created' }))
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
          }
        } else {
          socket.write(JSON.stringify({ error: 'Unknown action' }))
        }
      } catch (err) {
        socket.write(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
  })
  
  server.listen(12845, '127.0.0.1', () => {
    console.log('Extension socket server listening on port 12845')
  })
}

app.whenReady().then(async () => {
  await bootstrap()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
