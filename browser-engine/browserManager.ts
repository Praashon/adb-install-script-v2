import { chromium, Browser, BrowserContext } from 'playwright-core'

let browserInstance: Browser | null = null

export class BrowserManager {
  private context: BrowserContext | null = null

  async getBrowser(): Promise<Browser> {
    if (browserInstance && browserInstance.isConnected()) {
      return browserInstance
    }

    const executablePath = this.findChromium()

    browserInstance = await chromium.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    })

    return browserInstance
  }

  async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context

    const browser = await this.getBrowser()
    this.context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US'
    })

    return this.context
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close()
      this.context = null
    }
    if (browserInstance) {
      await browserInstance.close()
      browserInstance = null
    }
  }

  private findChromium(): string | undefined {
    const possiblePaths = [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`
    ]

    for (const p of possiblePaths) {
      if (p) {
        try {
          const { existsSync } = require('fs')
          if (existsSync(p)) return p
        } catch {}
      }
    }

    return undefined
  }
}
