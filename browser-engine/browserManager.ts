import { chromium, Browser, BrowserContext } from 'playwright-core'
import { existsSync } from 'fs'
import { join } from 'path'

export interface BrowserOptions {
  /**
   * Launch a visible window. Used when a site puts up a human-verification
   * check that the user needs to complete themselves.
   */
  headed?: boolean
}

let browserInstance: Browser | null = null
let browserMode: 'headed' | 'headless' | null = null

export class BrowserManager {
  private context: BrowserContext | null = null
  private headed: boolean

  constructor(options: BrowserOptions = {}) {
    this.headed = options.headed === true
  }

  async getBrowser(): Promise<Browser> {
    const wantedMode = this.headed ? 'headed' : 'headless'

    if (browserInstance?.isConnected() && browserMode === wantedMode) {
      return browserInstance
    }

    // Switching between headed and headless needs a fresh process.
    if (browserInstance?.isConnected()) {
      await browserInstance.close().catch(() => undefined)
    }

    browserInstance = await chromium.launch({
      headless: !this.headed,
      executablePath: BrowserManager.findChromium(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        // Without this, `navigator.webdriver` is true and ordinary pages
        // misbehave in ways a real browser would not.
        '--disable-blink-features=AutomationControlled'
      ]
    })
    browserMode = wantedMode

    return browserInstance
  }

  async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context

    const browser = await this.getBrowser()
    this.context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      acceptDownloads: true,
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
    })

    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })

    return this.context
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => undefined)
      this.context = null
    }
    if (browserInstance) {
      await browserInstance.close().catch(() => undefined)
      browserInstance = null
      browserMode = null
    }
  }

  /**
   * playwright-core ships no browsers of its own, so we drive whichever
   * Chromium-based browser is already installed.
   */
  static findChromium(): string {
    const programFiles = process.env.ProgramFiles
    const programFilesX86 = process.env['ProgramFiles(x86)']
    const localAppData = process.env.LOCALAPPDATA

    const relativeCandidates = [
      'Google/Chrome/Application/chrome.exe',
      'Microsoft/Edge/Application/msedge.exe',
      'BraveSoftware/Brave-Browser/Application/brave.exe',
      'Vivaldi/Application/vivaldi.exe',
      'Chromium/Application/chrome.exe'
    ]

    const roots = [programFiles, programFilesX86, localAppData].filter(
      (root): root is string => Boolean(root)
    )

    const candidates: string[] = [process.env.CHROME_PATH].filter((p): p is string => Boolean(p))

    for (const root of roots) {
      for (const relative of relativeCandidates) {
        candidates.push(join(root, relative))
      }
    }

    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge'
    )

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }

    throw new Error(
      'No Chrome, Edge, or Brave installation was found for the browser engine. Install one, or set CHROME_PATH to a Chromium executable.'
    )
  }
}
