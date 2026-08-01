import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface VerificationResult {
  installed: boolean
  packageName: string
  versionName?: string
  error?: string
}

export class Verifier {
  private adbPath: string

  constructor(adbPath?: string) {
    this.adbPath = adbPath || 'adb'
  }

  async verifyInstallation(packageName: string, serial?: string): Promise<VerificationResult> {
    try {
      const args = serial
        ? ['-s', serial, 'shell', 'pm', 'list', 'packages', packageName]
        : ['shell', 'pm', 'list', 'packages', packageName]

      const { stdout } = await execFileAsync(this.adbPath, args, { timeout: 10000 })

      const installed = stdout.includes(`package:${packageName}`)

      if (!installed) {
        return { installed: false, packageName, error: 'Package not found after installation' }
      }

      const versionName = await this.getInstalledVersion(packageName, serial)

      return { installed: true, packageName, versionName }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { installed: false, packageName, error: message }
    }
  }

  async getInstalledVersion(packageName: string, serial?: string): Promise<string | undefined> {
    try {
      const args = serial
        ? ['-s', serial, 'shell', 'dumpsys', 'package', packageName]
        : ['shell', 'dumpsys', 'package', packageName]

      const { stdout } = await execFileAsync(this.adbPath, args, { timeout: 10000 })

      const versionMatch = stdout.match(/versionName=([^\s]+)/)
      return versionMatch?.[1]
    } catch {
      return undefined
    }
  }

  async launchApp(packageName: string, serial?: string): Promise<boolean> {
    try {
      const args = serial
        ? ['-s', serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']
        : ['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']

      await execFileAsync(this.adbPath, args, { timeout: 10000 })
      return true
    } catch {
      return false
    }
  }
}
