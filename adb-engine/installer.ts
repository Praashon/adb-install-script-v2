import { execFile } from 'child_process'
import { promisify } from 'util'
import { basename } from 'path'
import { EventBus } from '@core/event-bus/eventBus'

const execFileAsync = promisify(execFile)

export interface InstallResult {
  success: boolean
  packageName?: string
  error?: string
  output: string
  duration: number
}

export interface InstallOptions {
  serial?: string
  signal?: AbortSignal
  /** Allow installing an older version over a newer one. */
  allowDowngrade?: boolean
  /** Grant all runtime permissions at install time. */
  grantPermissions?: boolean
}

export class Installer {
  private adbPath: string

  constructor(
    private eventBus: EventBus,
    adbPath?: string
  ) {
    this.adbPath = adbPath?.trim() || 'adb'
  }

  async installSingle(apkPath: string, options: InstallOptions = {}): Promise<InstallResult> {
    const startTime = Date.now()
    const args = this.buildArgs(options, ['install', ...this.installFlags(options), apkPath])

    this.eventBus.adb('info', `Installing ${basename(apkPath)}`, { serial: options.serial })

    return this.runInstall(args, startTime, options)
  }

  async installMultiple(apkPaths: string[], options: InstallOptions = {}): Promise<InstallResult> {
    if (apkPaths.length === 0) {
      return {
        success: false,
        error: 'No APK files to install',
        output: '',
        duration: 0
      }
    }

    if (apkPaths.length === 1) {
      return this.installSingle(apkPaths[0], options)
    }

    const startTime = Date.now()
    const args = this.buildArgs(options, [
      'install-multiple',
      ...this.installFlags(options),
      ...apkPaths
    ])

    this.eventBus.adb('info', `Installing split bundle (${apkPaths.length} APKs)`, {
      serial: options.serial
    })

    return this.runInstall(args, startTime, options, 240000)
  }

  async pushObb(
    obbPath: string,
    packageName: string,
    options: InstallOptions = {}
  ): Promise<boolean> {
    const remoteDir = `/sdcard/Android/obb/${packageName}`

    this.eventBus.adb('info', `Pushing OBB to ${remoteDir}`, { serial: options.serial })

    try {
      await execFileAsync(
        this.adbPath,
        this.buildArgs(options, ['shell', 'mkdir', '-p', remoteDir]),
        { timeout: 15000, signal: options.signal, windowsHide: true }
      )

      await execFileAsync(
        this.adbPath,
        this.buildArgs(options, ['push', obbPath, `${remoteDir}/`]),
        { timeout: 600000, signal: options.signal, windowsHide: true, maxBuffer: 1024 * 1024 * 16 }
      )

      this.eventBus.adb('info', `OBB pushed: ${basename(obbPath)}`)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.eventBus.adb('error', `OBB push failed: ${message}`)
      return false
    }
  }

  private async runInstall(
    args: string[],
    startTime: number,
    options: InstallOptions,
    timeout = 180000
  ): Promise<InstallResult> {
    try {
      const { stdout, stderr } = await execFileAsync(this.adbPath, args, {
        timeout,
        signal: options.signal,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8
      })

      const output = `${stdout}${stderr}`
      const duration = Date.now() - startTime

      // adb exits 0 even for some install failures, so the output is the
      // authority here — not the exit code.
      if (!/success/i.test(output)) {
        const error = this.parseInstallError(output)
        this.eventBus.adb('error', `Installation failed: ${error}`, { output })
        return { success: false, error, output, duration }
      }

      this.eventBus.adb('info', 'Installed successfully', { duration })
      return { success: true, output, duration }
    } catch (error) {
      const duration = Date.now() - startTime
      const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
      const output = `${err.stdout ?? ''}${err.stderr ?? ''}`

      if (err.code === 'ENOENT') {
        return {
          success: false,
          error: `ADB executable not found at "${this.adbPath}". Check the ADB path in Settings.`,
          output,
          duration
        }
      }

      const message = output.trim()
        ? this.parseInstallError(output)
        : err.message || 'Unknown error'

      return { success: false, error: message, output, duration }
    }
  }

  private installFlags(options: InstallOptions): string[] {
    const flags = ['-r']
    if (options.allowDowngrade) flags.push('-d')
    if (options.grantPermissions) flags.push('-g')
    return flags
  }

  private buildArgs(options: InstallOptions, args: string[]): string[] {
    return options.serial ? ['-s', options.serial, ...args] : args
  }

  private parseInstallError(output: string): string {
    const errorMap: Record<string, string> = {
      INSTALL_FAILED_ALREADY_EXISTS: 'Application already exists on the device.',
      INSTALL_FAILED_INVALID_APK: 'The APK file is invalid or corrupted.',
      INSTALL_FAILED_INSUFFICIENT_STORAGE: 'Not enough storage space on the device.',
      INSTALL_FAILED_DUPLICATE_PACKAGE: 'A package with the same name already exists.',
      INSTALL_FAILED_VERSION_DOWNGRADE:
        'A newer version is already installed. Enable "Allow downgrade" in Settings to replace it.',
      INSTALL_FAILED_UPDATE_INCOMPATIBLE:
        'Signed with a different certificate than the installed app. Uninstall the existing app first.',
      INSTALL_PARSE_FAILED_NO_CERTIFICATES: 'The APK is not properly signed.',
      INSTALL_FAILED_OLDER_SDK: 'This APK requires a newer Android version than the device has.',
      INSTALL_FAILED_TEST_ONLY: 'This is a test-only APK and cannot be installed normally.',
      INSTALL_FAILED_NO_MATCHING_ABIS:
        "The APK does not support this device's CPU architecture.",
      INSTALL_FAILED_USER_RESTRICTED:
        'The device blocked the install. Accept the prompt on your device or enable "Install via USB".',
      INSTALL_FAILED_MISSING_SPLIT: 'Missing split APKs — install the full bundle instead.',
      INSTALL_FAILED_VERIFICATION_FAILURE:
        'Play Protect blocked the install. Disable "Verify apps over USB" on the device.'
    }

    for (const [code, message] of Object.entries(errorMap)) {
      if (output.includes(code)) return message
    }

    if (/device unauthorized/i.test(output)) {
      return 'Device is unauthorized. Accept the USB debugging prompt on your device.'
    }
    if (/no devices\/emulators found/i.test(output)) {
      return 'No device connected.'
    }
    if (/device .* not found/i.test(output)) {
      return 'The selected device is no longer connected.'
    }

    const failureMatch = output.match(/Failure \[([^\]]+)\]/)
    if (failureMatch) return failureMatch[1]

    const errorLine = output
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /^(error|adb:)/i.test(l))
    if (errorLine) return errorLine

    return 'Installation failed with an unknown error'
  }
}
