import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface ElectronAPI {
  window: {
    minimize(): void
    maximize(): void
    close(): void
  }

  jobs: {
    create(url: string, deviceId?: string): Promise<string>
    getAll(): Promise<unknown[]>
    getById(id: string): Promise<unknown>
    cancel(id: string): Promise<void>
    retry(id: string): Promise<void>
    pause(id: string): Promise<void>
    resume(id: string): Promise<void>
  }

  sources: {
    detect(url: string): Promise<unknown>
    getAll(): Promise<unknown[]>
    getById(id: string): Promise<unknown>
    create(data: unknown): Promise<string>
    update(id: string, data: unknown): Promise<void>
    remove(id: string): Promise<void>
    test(id: string): Promise<unknown>
    analyze(url: string): Promise<unknown>
    importAdapter(filePath: string): Promise<void>
    exportAdapter(id: string, targetPath: string): Promise<void>
  }

  devices: {
    list(): Promise<unknown[]>
    getInfo(serial: string): Promise<unknown>
    setPreferred(serial: string): Promise<void>
  }

  downloads: {
    getAll(): Promise<unknown[]>
    getById(id: string): Promise<unknown>
    remove(id: string): Promise<void>
    openFolder(id: string): Promise<void>
  }

  settings: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
    getAll(): Promise<Record<string, unknown>>
  }

  onEvent(callback: (event: string, data: unknown) => void): () => void
}

const api: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },

  jobs: {
    create: (url, deviceId) => ipcRenderer.invoke('job:create', url, deviceId),
    getAll: () => ipcRenderer.invoke('job:getAll'),
    getById: (id) => ipcRenderer.invoke('job:getById', id),
    cancel: (id) => ipcRenderer.invoke('job:cancel', id),
    retry: (id) => ipcRenderer.invoke('job:retry', id),
    pause: (id) => ipcRenderer.invoke('job:pause', id),
    resume: (id) => ipcRenderer.invoke('job:resume', id)
  },

  sources: {
    detect: (url) => ipcRenderer.invoke('source:detect', url),
    getAll: () => ipcRenderer.invoke('source:getAll'),
    getById: (id) => ipcRenderer.invoke('source:getById', id),
    create: (data) => ipcRenderer.invoke('source:create', data),
    update: (id, data) => ipcRenderer.invoke('source:update', id, data),
    remove: (id) => ipcRenderer.invoke('source:remove', id),
    test: (id) => ipcRenderer.invoke('source:test', id),
    analyze: (url) => ipcRenderer.invoke('source:analyze', url),
    importAdapter: (filePath) => ipcRenderer.invoke('source:import', filePath),
    exportAdapter: (id, targetPath) => ipcRenderer.invoke('source:export', id, targetPath)
  },

  devices: {
    list: () => ipcRenderer.invoke('device:list'),
    getInfo: (serial) => ipcRenderer.invoke('device:getInfo', serial),
    setPreferred: (serial) => ipcRenderer.invoke('device:setPreferred', serial)
  },

  downloads: {
    getAll: () => ipcRenderer.invoke('download:getAll'),
    getById: (id) => ipcRenderer.invoke('download:getById', id),
    remove: (id) => ipcRenderer.invoke('download:remove', id),
    openFolder: (id) => ipcRenderer.invoke('download:openFolder', id)
  },

  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },

  onEvent(callback) {
    const handler = (_event: IpcRendererEvent, payload: { event: string; data: unknown }) => {
      callback(payload.event, payload.data)
    }
    ipcRenderer.on('event-bus:message', handler)
    return () => {
      ipcRenderer.removeListener('event-bus:message', handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
