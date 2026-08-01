import { BrowserContext, Page, Route, Request } from 'playwright-core'
import { BrowserManager } from './browserManager'

interface InterceptedDownload {
  url: string
  filename?: string
  mimeType?: string
  headers: Record<string, string>
}

const APK_MIME_TYPES = [
  'application/vnd.android.package-archive',
  'application/octet-stream',
  'application/x-zip',
  'application/zip'
]

const APK_EXTENSIONS = ['.apk', '.xapk', '.apks']

export class NetworkInterceptor {
  private browserManager: BrowserManager
  private interceptedDownloads: InterceptedDownload[] = []

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager
  }

  async captureDownloadUrl(
    pageUrl: string,
    options?: { clickSelector?: string; waitTimeout?: number }
  ): Promise<InterceptedDownload | null> {
    this.interceptedDownloads = []
    const context = await this.browserManager.getContext()
    const page = await context.newPage()

    try {
      await page.route('**/*', async (route: Route, request: Request) => {
        const url = request.url()
        const resourceType = request.resourceType()

        if (this.isApkUrl(url)) {
          const headers = await request.allHeaders()
          this.interceptedDownloads.push({
            url,
            filename: this.extractFilename(url),
            headers
          })
          await route.abort()
          return
        }

        if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
          await route.abort()
          return
        }

        await route.continue()
      })

      await page.goto(pageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: options?.waitTimeout ?? 30000
      })

      if (this.interceptedDownloads.length > 0) {
        return this.interceptedDownloads[0]
      }

      if (options?.clickSelector) {
        try {
          await page.click(options.clickSelector, { timeout: 5000 })
          await page.waitForTimeout(3000)

          if (this.interceptedDownloads.length > 0) {
            return this.interceptedDownloads[0]
          }
        } catch {}
      }

      const downloadButtons = await page.$$('a[href*=".apk"], a[href*="download"], button:has-text("Download")')
      for (const button of downloadButtons) {
        try {
          await button.click()
          await page.waitForTimeout(2000)

          if (this.interceptedDownloads.length > 0) {
            return this.interceptedDownloads[0]
          }
        } catch {}
      }

      return this.interceptedDownloads[0] ?? null
    } finally {
      await page.close()
    }
  }

  private isApkUrl(url: string): boolean {
    const lower = url.toLowerCase()
    return APK_EXTENSIONS.some((ext) => lower.includes(ext))
  }

  private extractFilename(url: string): string | undefined {
    try {
      const pathname = new URL(url).pathname
      const segments = pathname.split('/')
      const last = segments[segments.length - 1]
      if (last && last.includes('.')) return decodeURIComponent(last)
    } catch {}
    return undefined
  }
}
