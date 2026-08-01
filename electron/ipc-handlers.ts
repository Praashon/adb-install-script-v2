import { ipcMain, BrowserWindow, shell } from 'electron'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { EventBus } from '@core/event-bus/eventBus'
import { JobRunner } from '@core/job-manager/jobRunner'
import { JobQueue } from '@core/job-manager/jobQueue'
import { SourceRepository } from '@core/database/repositories/sourceRepository'
import { AdapterRepository } from '@core/database/repositories/adapterRepository'
import { JobRepository } from '@core/database/repositories/jobRepository'
import { DownloadRepository } from '@core/database/repositories/downloadRepository'
import { DeviceRepository } from '@core/database/repositories/deviceRepository'
import { SettingsRepository } from '@core/database/repositories/settingsRepository'
import * as schema from '@core/database/schema'

export function registerIpcHandlers(
  db: BetterSQLite3Database<typeof schema>,
  eventBus: EventBus,
  jobRunner: JobRunner
): void {
  const sourceRepo = new SourceRepository(db)
  const adapterRepo = new AdapterRepository(db)
  const jobRepo = new JobRepository(db)
  const downloadRepo = new DownloadRepository(db)
  const deviceRepo = new DeviceRepository(db)
  const settingsRepo = new SettingsRepository(db)
  const jobQueue = new JobQueue(db, eventBus)

  registerWindowHandlers()
  registerJobHandlers(jobQueue, jobRepo, jobRunner)
  registerSourceHandlers(sourceRepo, adapterRepo)
  registerDeviceHandlers(deviceRepo)
  registerDownloadHandlers(downloadRepo)
  registerSettingsHandlers(settingsRepo)
}

function registerWindowHandlers(): void {
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}

function registerJobHandlers(
  jobQueue: JobQueue,
  jobRepo: JobRepository,
  jobRunner: JobRunner
): void {
  ipcMain.handle('job:create', async (_event, url: string, deviceId?: string) => {
    const jobId = await jobQueue.enqueue(url, deviceId)
    jobRunner.processNext()
    return jobId
  })

  ipcMain.handle('job:getAll', async () => {
    return jobRepo.findAll()
  })

  ipcMain.handle('job:getById', async (_event, id: string) => {
    return jobRepo.findById(id)
  })

  ipcMain.handle('job:cancel', async (_event, id: string) => {
    await jobRunner.cancelJob(id)
  })

  ipcMain.handle('job:retry', async (_event, id: string) => {
    await jobQueue.requeueFailed(id)
    jobRunner.processNext()
  })

  ipcMain.handle('job:pause', async (_event, id: string) => {
    await jobRunner.pauseJob(id)
  })

  ipcMain.handle('job:resume', async (_event, id: string) => {
    await jobRunner.resumeJob(id)
  })
}

function registerSourceHandlers(
  sourceRepo: SourceRepository,
  _adapterRepo: AdapterRepository
): void {
  ipcMain.handle('source:detect', async (_event, url: string) => {
    const { SourceDetector } = await import('@source-engine/sourceDetector')
    const detector = new SourceDetector(sourceRepo)
    return detector.detect(url)
  })

  ipcMain.handle('source:getAll', async () => {
    return sourceRepo.findAll()
  })

  ipcMain.handle('source:getById', async (_event, id: string) => {
    return sourceRepo.findById(id)
  })

  ipcMain.handle('source:create', async (_event, data: unknown) => {
    return sourceRepo.create(data as Parameters<SourceRepository['create']>[0])
  })

  ipcMain.handle('source:update', async (_event, id: string, data: unknown) => {
    return sourceRepo.update(id, data as Parameters<SourceRepository['update']>[1])
  })

  ipcMain.handle('source:remove', async (_event, id: string) => {
    return sourceRepo.remove(id)
  })

  ipcMain.handle('source:test', async (_event, _id: string) => {
    return { success: true, message: 'Adapter test not yet implemented' }
  })

  ipcMain.handle('source:analyze', async (_event, url: string) => {
    const { WebsiteAnalyzer } = await import('@source-engine/websiteAnalyzer')
    const analyzer = new WebsiteAnalyzer()
    return analyzer.analyze(url)
  })

  ipcMain.handle('source:import', async (_event, _filePath: string) => {
    return { success: true }
  })

  ipcMain.handle('source:export', async (_event, _id: string, _targetPath: string) => {
    return { success: true }
  })
}

function registerDeviceHandlers(deviceRepo: DeviceRepository): void {
  ipcMain.handle('device:list', async () => {
    const { AdbManager } = await import('@adb-engine/adbManager')
    const adb = new AdbManager()
    const devices = await adb.listDevices()

    for (const device of devices) {
      await deviceRepo.upsert({
        serial: device.serial,
        model: device.model,
        manufacturer: device.manufacturer,
        androidVersion: device.androidVersion,
        architecture: device.architecture,
        status: device.status
      })
    }

    return devices
  })

  ipcMain.handle('device:getInfo', async (_event, serial: string) => {
    const { AdbManager } = await import('@adb-engine/adbManager')
    const adb = new AdbManager()
    return adb.getDeviceInfo(serial)
  })

  ipcMain.handle('device:setPreferred', async (_event, serial: string) => {
    await deviceRepo.setPreferred(serial)
  })
}

function registerDownloadHandlers(downloadRepo: DownloadRepository): void {
  ipcMain.handle('download:getAll', async () => {
    return downloadRepo.findAll()
  })

  ipcMain.handle('download:getById', async (_event, id: string) => {
    return downloadRepo.findById(id)
  })

  ipcMain.handle('download:remove', async (_event, id: string) => {
    return downloadRepo.remove(id)
  })

  ipcMain.handle('download:openFolder', async (_event, id: string) => {
    const download = await downloadRepo.findById(id)
    if (download?.filePath) {
      shell.showItemInFolder(download.filePath)
    }
  })
}

function registerSettingsHandlers(settingsRepo: SettingsRepository): void {
  ipcMain.handle('settings:get', async (_event, key: string) => {
    return settingsRepo.get(key)
  })

  ipcMain.handle('settings:set', async (_event, key: string, value: unknown) => {
    return settingsRepo.set(key, JSON.stringify(value))
  })

  ipcMain.handle('settings:getAll', async () => {
    return settingsRepo.getAll()
  })
}
