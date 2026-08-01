import { Parser } from '@source-engine/parser'
import { SandboxedAdapter } from '@security-engine/sandbox'
import { ResolvedDownload } from './resolver'
import { EventBus } from '@core/event-bus/eventBus'

export class DirectDownloadStrategy {
  async resolve(url: string): Promise<ResolvedDownload> {
    return { url, filename: this.extractFilename(url), strategy: 'direct' }
  }

  private extractFilename(url: string): string {
    try {
      const last = new URL(url).pathname.split('/').pop()
      if (last && last.includes('.')) return decodeURIComponent(last)
    } catch {}
    return 'download.apk'
  }
}

export class HTMLDownloadStrategy {
  constructor(private parser: Parser, private eventBus: EventBus) {}

  async resolve(url: string, adapter: SandboxedAdapter): Promise<ResolvedDownload | null> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...adapter.getAllHeaders()
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch page: HTTP ${response.status}`)
    }

    const html = await response.text()
    const result = await this.parser.parseDownloadPage(html, url, adapter)

    if (!result) {
      this.eventBus.download('warn', 'HTML strategy found no download link', { url })
      return null
    }

    this.eventBus.download('info', 'HTML strategy resolved download', {
      downloadUrl: result.downloadUrl,
      filename: result.filename
    })

    return {
      url: result.downloadUrl,
      filename: result.filename,
      strategy: 'html',
      headers: adapter.getAllHeaders()
    }
  }
}

export class RedirectDownloadStrategy {
  constructor(private eventBus: EventBus) {}

  async resolve(url: string, maxRedirects: number = 5): Promise<ResolvedDownload> {
    let currentUrl = url
    let redirectCount = 0

    while (redirectCount < maxRedirects) {
      const response = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) break

        currentUrl = new URL(location, currentUrl).toString()
        redirectCount++

        this.eventBus.download('info', `Redirect ${redirectCount}: ${currentUrl}`)
        continue
      }

      break
    }

    const filename = this.extractFilename(currentUrl)

    return {
      url: currentUrl,
      filename,
      strategy: 'redirect'
    }
  }

  private extractFilename(url: string): string {
    try {
      const last = new URL(url).pathname.split('/').pop()
      if (last && last.includes('.')) return decodeURIComponent(last)
    } catch {}
    return 'download.apk'
  }
}

export class BrowserDownloadStrategy {
  constructor(private eventBus: EventBus) {}

  async resolve(
    url: string,
    adapter?: SandboxedAdapter
  ): Promise<ResolvedDownload | null> {
    try {
      const { NetworkInterceptor } = await import('@browser-engine/networkInterceptor')
      const { BrowserManager } = await import('@browser-engine/browserManager')

      const browserManager = new BrowserManager()
      const interceptor = new NetworkInterceptor(browserManager)

      const clickSelector = adapter?.getSelector('downloadLinkSelector') ||
        adapter?.getSelector('downloadPageSelector')

      const result = await interceptor.captureDownloadUrl(url, {
        clickSelector: clickSelector || undefined,
        waitTimeout: adapter?.getTimeout() ?? 30000
      })

      await browserManager.close()

      if (!result) {
        this.eventBus.download('warn', 'Browser strategy found no download', { url })
        return null
      }

      this.eventBus.download('info', 'Browser strategy captured download', {
        downloadUrl: result.url
      })

      return {
        url: result.url,
        filename: result.filename || 'download.apk',
        strategy: 'browser',
        headers: result.headers
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.eventBus.download('error', `Browser strategy failed: ${message}`)
      return null
    }
  }
}
