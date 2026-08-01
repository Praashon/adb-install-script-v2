const api = () => window.electronAPI

export const jobService = {
  create: (url: string, deviceId?: string) => api().jobs.create(url, deviceId),
  getAll: () => api().jobs.getAll(),
  getById: (id: string) => api().jobs.getById(id),
  cancel: (id: string) => api().jobs.cancel(id),
  retry: (id: string) => api().jobs.retry(id),
  pause: (id: string) => api().jobs.pause(id),
  resume: (id: string) => api().jobs.resume(id)
}

export const sourceService = {
  detect: (url: string) => api().sources.detect(url),
  getAll: () => api().sources.getAll(),
  getById: (id: string) => api().sources.getById(id),
  create: (data: unknown) => api().sources.create(data),
  update: (id: string, data: unknown) => api().sources.update(id, data),
  remove: (id: string) => api().sources.remove(id),
  test: (id: string) => api().sources.test(id),
  analyze: (url: string) => api().sources.analyze(url),
  importAdapter: (filePath: string) => api().sources.importAdapter(filePath),
  exportAdapter: (id: string, targetPath: string) => api().sources.exportAdapter(id, targetPath)
}

export const deviceService = {
  list: () => api().devices.list(),
  getInfo: (serial: string) => api().devices.getInfo(serial),
  setPreferred: (serial: string) => api().devices.setPreferred(serial)
}

export const downloadService = {
  getAll: () => api().downloads.getAll(),
  getById: (id: string) => api().downloads.getById(id),
  remove: (id: string) => api().downloads.remove(id),
  openFolder: (id: string) => api().downloads.openFolder(id)
}

export const settingsService = {
  get: (key: string) => api().settings.get(key),
  set: (key: string, value: unknown) => api().settings.set(key, value),
  getAll: () => api().settings.getAll()
}
