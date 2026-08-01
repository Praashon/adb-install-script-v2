import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventBus } from '@core/event-bus/eventBus'

const execFileAsync = promisify(execFile)

export interface InstallResult {
  success: boolean
  packageName?: string
  error?: string
  output: string
  duration: number
}

export class Installer {
  private adbPath: string

  constructor(
    private eventBus: EventBus,
    adbPath?: string
  ) {
    this.adbPath = adbPath || 'adb'
  }

  async installSingle(
    apkPath: string,
    serial?: string
  ): Promise<InstallResult> {
    const startTime = Date.now()
    const args = this.buildArgs(serial, ['install', '-r', apkPath])

    this.eventBus.adb('info', `Installing APK: ${apkPath}`, { serial })

    try {
      const { stdout, stderr } = await execFileAsync(this.adbPath, args, {
        timeout: 120000
      })

      const output = stdout + stderr
      const success = output.toLowerCase().includes('success')
      const duration = Date.now() - startTime

      if (success) {
        this.eventBus.adb('info', 'APK installed successfully', { duration })
      } else {
        const error = this.parseInstallError(output)
        this.eventBus.adb('error', `Installation failed: ${error}`, { output })
        return { success: false, error, output, duration }
      }

      return { success, output, duration }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message, output: '', duration }
    }
  }

  async installMultiple(
    apkPaths: string[],
    serial?: string
  ): Promise<InstallResult> {
    const startTime = Date.now()
    const args = this.buildArgs(serial, ['install-multiple', '-r', ...apkPaths])

    this.eventBus.adb('info', `Installing split APKs: ${apkPaths.length} files`, { serial })

    try {
      const { stdout, stderr } = await execFileAsync(this.adbPath, args, {
        timeout: 180000
      })

      const output = stdout + stderr
      const success = output.toLowerCase().includes('success')
      const duration = Date.now() - startTime

      if (success) {
        this.eventBus.adb('info', 'Split APKs installed successfully', {
          fileCount: apkPaths.length,
          duration
        })
      } else {
        const error = this.parseInstallError(output)
        this.eventBus.adb('error', `Split installation failed: ${error}`, { output })
        return { success: false, error, output, duration }
      }

      return { success, output, duration }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message, output: '', duration }
    }
  }

  async pushObb(
    obbPath: string,
    packageName: string,
    serial?: string
  ): Promise<boolean> {
    const remotePath = `/sdcard/Android/obb/${packageName}/`
    const args = this.buildArgs(serial, ['push', obbPath, remotePath])

    this.eventBus.adb('info', `Pushing OBB to ${remotePath}`, { serial })

    try {
      const mkdirArgs = this.buildArgs(serial, ['shell', 'mkdir', '-p', remotePath])
      await execFileAsync(this.adbPath, mkdirArgs, { timeout: 10000 })

      await execFileAsync(this.adbPath, args, { timeout: 300000 })
      this.eventBus.adb('info', 'OBB pushed successfully')
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.eventBus.adb('error', `OBB push failed: ${message}`)
      return false
    }
  }

  private buildArgs(serial: string | undefined, args: string[]): string[] {
    if (serial) return ['-s', serial, ...args]
    return args
  }

  private parseInstallError(output: string): string {
    const errorMap: Record<string, string> = {
      'INSTALL_FAILED_ALREADY_EXISTS': 'Application already exists. Use -r flag to replace.',
      'INSTALL_FAILED_INVALID_APK': 'The APK file is invalid or corrupted.',
      'INSTALL_FAILED_INSUFFICIENT_STORAGE': 'Not enough storage space on the device.',
      'INSTALL_FAILED_DUPLICATE_PACKAGE': 'A package with the same name already exists.',
      'INSTALL_FAILED_VERSION_DOWNGRADE': 'Cannot install an older version over a newer one.',
      'INSTALL_FAILED_UPDATE_INCOMPATIBLE': 'The update is incompatible with the installed version.',
      'INSTALL_PARSE_FAILED_NO_CERTIFICATES': 'The APK is not properly signed.',
      'INSTALL_FAILED_OLDER_SDK': 'The device Android version is too old for this APK.',
      'INSTALL_FAILED_TEST_ONLY': 'This is a test-only APK and cannot be installed normally.'
    }

    for (const [code, message] of Object.entries(errorMap)) {
      if (output.includes(code)) return message
    }

    const failureMatch = output.match(/Failure \[([^\]]+)\]/)
    if (failureMatch) return failureMatch[1]

    return 'Installation failed with unknown error'
  }
}
