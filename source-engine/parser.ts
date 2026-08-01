import * as cheerio from 'cheerio'
import { SandboxedAdapter } from '@security-engine/sandbox'
import { ParsedDownload } from './types'

export class Parser {
  async parseDownloadPage(
    html: string,
    baseUrl: string,
    adapter: SandboxedAdapter
  ): Promise<ParsedDownload | null> {
    const $ = cheerio.load(html)

    const primarySelector = adapter.getSelector('downloadLinkSelector')
    if (primarySelector) {
      const result = this.extractFromSelector($, primarySelector, baseUrl)
      if (result) return result
    }

    const pageSelector = adapter.getSelector('downloadPageSelector')
    if (pageSelector) {
      const result = this.extractFromSelector($, pageSelector, baseUrl)
      if (result) return result
    }

    const fallbacks = adapter.getFallbackSelectors()
    for (const selector of fallbacks) {
      const result = this.extractFromSelector($, selector, baseUrl)
      if (result) return result
    }

    const buttonTexts = adapter.rules.rules?.downloadButtonText
    if (Array.isArray(buttonTexts)) {
      for (const text of buttonTexts) {
        const result = this.findByButtonText($, text as string, baseUrl)
        if (result) return result
      }
    }

    return this.autoDetect($, baseUrl)
  }

  extractMetadata(html: string, adapter: SandboxedAdapter): Record<string, string> {
    const $ = cheerio.load(html)
    const metadata: Record<string, string> = {}

    const nameSelector = adapter.getSelector('appNameSelector')
    if (nameSelector) {
      const name = $(nameSelector).first().text().trim()
      if (name) metadata.appName = name
    }

    const versionSelector = adapter.getSelector('versionSelector')
    if (versionSelector) {
      const version = $(versionSelector).first().text().trim()
      if (version) metadata.version = version
    }

    const packageSelector = adapter.getSelector('packageNameSelector')
    if (packageSelector) {
      const pkg = $(packageSelector).first().text().trim()
      if (pkg) metadata.packageName = pkg
    }

    const sizeSelector = adapter.getSelector('sizeSelector')
    if (sizeSelector) {
      const size = $(sizeSelector).first().text().trim()
      if (size) metadata.size = size
    }

    if (!metadata.appName) {
      metadata.appName = $('h1').first().text().trim() || $('title').text().trim()
    }

    return metadata
  }

  private extractFromSelector(
    $: cheerio.CheerioAPI,
    selector: string,
    baseUrl: string
  ): ParsedDownload | null {
    const elements = $(selector)
    if (elements.length === 0) return null

    for (let i = 0; i < elements.length; i++) {
      const el = elements.eq(i)
      const href = el.attr('href') || el.attr('data-href') || el.attr('data-url')
      if (!href) continue

      const resolvedUrl = this.resolveUrl(href, baseUrl)
      if (!resolvedUrl) continue

      const fileType = this.detectFileType(resolvedUrl)
      const filename = this.extractFilename(resolvedUrl)

      return {
        downloadUrl: resolvedUrl,
        filename,
        fileType,
        appName: el.attr('data-name') || el.attr('title') || undefined
      }
    }

    return null
  }

  private findByButtonText(
    $: cheerio.CheerioAPI,
    text: string,
    baseUrl: string
  ): ParsedDownload | null {
    const normalizedText = text.toLowerCase()

    const candidates = $('a, button').filter((_i, el) => {
      const elText = $(el).text().toLowerCase().trim()
      return elText.includes(normalizedText)
    })

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates.eq(i)
      const href = el.attr('href')
      if (!href) continue

      const resolvedUrl = this.resolveUrl(href, baseUrl)
      if (!resolvedUrl) continue

      return {
        downloadUrl: resolvedUrl,
        filename: this.extractFilename(resolvedUrl),
        fileType: this.detectFileType(resolvedUrl)
      }
    }

    return null
  }

  private autoDetect($: cheerio.CheerioAPI, baseUrl: string): ParsedDownload | null {
    const apkLinks = $('a[href*=".apk"], a[href*=".xapk"], a[href*=".apks"]')

    for (let i = 0; i < apkLinks.length; i++) {
      const href = apkLinks.eq(i).attr('href')
      if (!href) continue

      const resolvedUrl = this.resolveUrl(href, baseUrl)
      if (!resolvedUrl) continue

      return {
        downloadUrl: resolvedUrl,
        filename: this.extractFilename(resolvedUrl),
        fileType: this.detectFileType(resolvedUrl)
      }
    }

    return null
  }

  private resolveUrl(href: string, baseUrl: string): string | null {
    try {
      if (href.startsWith('http://') || href.startsWith('https://')) {
        return href
      }
      return new URL(href, baseUrl).toString()
    } catch {
      return null
    }
  }

  private detectFileType(url: string): ParsedDownload['fileType'] {
    const lower = url.toLowerCase()
    if (lower.includes('.xapk')) return 'xapk'
    if (lower.includes('.apks')) return 'apks'
    if (lower.includes('.apk')) return 'apk'
    if (lower.includes('.zip')) return 'zip'
    return 'unknown'
  }

  private extractFilename(url: string): string {
    try {
      const pathname = new URL(url).pathname
      const segments = pathname.split('/')
      const lastSegment = segments[segments.length - 1]
      if (lastSegment && lastSegment.includes('.')) {
        return decodeURIComponent(lastSegment)
      }
    } catch {}
    return 'download.apk'
  }
}
