import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'

const execFileAsync = promisify(execFile)

export interface AdbDevice {
  serial: string
  status: 'online' | 'offline' | 'unauthorized'
  model: string
  manufacturer: string
  androidVersion: string
  architecture: string
}

export class AdbManager {
  private adbPath: string

  constructor(adbPath?: string) {
    this.adbPath = adbPath || this.findAdb()
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.exec(['version'])
      return true
    } catch {
      return false
    }
  }

  async listDevices(): Promise<AdbDevice[]> {
    const { stdout } = await this.exec(['devices', '-l'])
    const lines = stdout.trim().split('\n').slice(1)
    const devices: AdbDevice[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('*')) continue

      const parts = trimmed.split(/\s+/)
      if (parts.length < 2) continue

      const serial = parts[0]
      const rawStatus = parts[1]
      const status = rawStatus === 'device' ? 'online' :
                     rawStatus === 'unauthorized' ? 'unauthorized' : 'offline'

      let model = ''
      let product = ''
      for (const part of parts.slice(2)) {
        if (part.startsWith('model:')) model = part.replace('model:', '')
        if (part.startsWith('product:')) product = part.replace('product:', '')
      }

      let manufacturer = ''
      let androidVersion = ''
      let architecture = ''

      if (status === 'online') {
        try {
          const info = await this.getDeviceProperties(serial)
          manufacturer = info.manufacturer
          androidVersion = info.androidVersion
          architecture = info.architecture
          if (!model) model = info.model
        } catch {}
      }

      devices.push({
        serial,
        status,
        model: model || product || serial,
        manufacturer,
        androidVersion,
        architecture
      })
    }

    return devices
  }

  async getDeviceInfo(serial: string): Promise<AdbDevice> {
    const props = await this.getDeviceProperties(serial)
    return {
      serial,
      status: 'online',
      ...props
    }
  }

  private async getDeviceProperties(serial: string): Promise<{
    model: string
    manufacturer: string
    androidVersion: string
    architecture: string
  }> {
    const getProp = async (prop: string): Promise<string> => {
      try {
        const { stdout } = await this.exec(['-s', serial, 'shell', 'getprop', prop])
        return stdout.trim()
      } catch {
        return ''
      }
    }

    const [model, manufacturer, androidVersion, architecture] = await Promise.all([
      getProp('ro.product.model'),
      getProp('ro.product.manufacturer'),
      getProp('ro.build.version.release'),
      getProp('ro.product.cpu.abi')
    ])

    return { model, manufacturer, androidVersion, architecture }
  }

  private async exec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync(this.adbPath, args, { timeout: 30000 })
  }

  private findAdb(): string {
    const candidates = [
      'adb',
      process.env.ADB_PATH,
      `${process.env.ANDROID_HOME}/platform-tools/adb`,
      `${process.env.ANDROID_HOME}/platform-tools/adb.exe`,
      `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`,
      'C:\\platform-tools\\adb.exe'
    ].filter(Boolean) as string[]

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }

    return 'adb'
  }
}
