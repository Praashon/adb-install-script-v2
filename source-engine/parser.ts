import * as cheerio from 'cheerio'
import { SandboxedAdapter } from '@security-engine/sandbox'
import { ParsedDownload } from './types'

interface ScoredCandidate {
  score: number
  result: ParsedDownload
}

export class Parser {
  /**
   * Gathers candidates from every configured selector and returns the
   * best-ranked one.
   *
   * Taking the first selector that matches anything is unreliable: a broad
   * primary selector such as `a[href*='/download/']` also matches version
   * lists and language switchers, which would shadow a genuine APK link that
   * only a fallback selector finds.
   */
  async parseDownloadPage(
    html: string,
    baseUrl: string,
    adapter: SandboxedAdapter
  ): Promise<ParsedDownload | null> {
    const $ = cheerio.load(html)
    const candidates: ScoredCandidate[] = []

    const selectors = [
      adapter.getSelector('downloadLinkSelector'),
      adapter.getSelector('downloadPageSelector'),
      ...adapter.getFallbackSelectors(),
      'a[href*=".apk"], a[href*=".xapk"], a[href*=".apks"], a[href*="download"]'
    ].filter((selector): selector is string => Boolean(selector))

    for (const selector of selectors) {
      candidates.push(...this.collectCandidates($, selector, baseUrl))
    }

    const buttonTexts = adapter.rules.rules?.downloadButtonText
    if (Array.isArray(buttonTexts)) {
      for (const text of buttonTexts) {
        candidates.push(...this.collectByButtonText($, text as string, baseUrl))
      }
    }

    if (candidates.length === 0) return null

    const best = candidates.reduce((a, b) => (b.score > a.score ? b : a))
    return best.result
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

  private collectCandidates(
    $: cheerio.CheerioAPI,
    selector: string,
    baseUrl: string
  ): ScoredCandidate[] {
    let elements: cheerio.Cheerio<never>
    try {
      elements = $(selector) as unknown as cheerio.Cheerio<never>
    } catch {
      return [] // Adapter supplied an invalid CSS selector.
    }

    const candidates: ScoredCandidate[] = []

    for (let i = 0; i < elements.length; i++) {
      const el = $(elements[i])
      const href = el.attr('href') || el.attr('data-href') || el.attr('data-url')
      if (!href) continue

      const resolvedUrl = this.resolveUrl(href, baseUrl)
      if (!resolvedUrl) continue

      const score = this.scoreCandidate(resolvedUrl, baseUrl, el.text())
      if (score < 0) continue

      candidates.push({
        score,
        result: {
          downloadUrl: resolvedUrl,
          filename: this.extractFilename(resolvedUrl),
          fileType: this.detectFileType(resolvedUrl),
          appName: el.attr('data-name') || el.attr('title') || undefined
        }
      })
    }

    return candidates
  }

  /**
   * Ranks a candidate link. Negative means "never use this".
   *
   * The strongest signal is a real package extension, then an APK filename
   * carried in the query string (CDN redirectors such as `/r2?u=...` do this),
   * then generic download wording.
   */
  private scoreCandidate(url: string, baseUrl: string, text: string): number {
    // Links back to the current page are navigation, not downloads.
    if (this.stripHash(url) === this.stripHash(baseUrl)) return -1

    let score = 0

    let pathname = url.toLowerCase()
    let query = ''
    try {
      const parsed = new URL(url)
      pathname = parsed.pathname.toLowerCase()
      query = decodeURIComponent(parsed.search).toLowerCase()
    } catch {
      /* keep the raw string */
    }

    if (['.apk', '.xapk', '.apks'].some((ext) => pathname.endsWith(ext))) score += 100
    if (/filename[^&]*\.(apk|xapk|apks)/.test(query)) score += 60
    if (/\.(apk|xapk|apks)(\?|&|$)/.test(query)) score += 40
    if (/\/(download|dl)\//.test(pathname)) score += 10
    if (/download/i.test(text)) score += 5

    // Locale-prefixed copies of the same page (/pt/..., /es/...) are the same
    // navigation link in another language.
    if (/^\/[a-z]{2}(-[a-z]{2})?\//i.test(pathname)) score -= 15

    return score
  }

  private stripHash(url: string): string {
    const hashIndex = url.indexOf('#')
    return (hashIndex === -1 ? url : url.slice(0, hashIndex)).replace(/\/$/, '')
  }

  private collectByButtonText(
    $: cheerio.CheerioAPI,
    text: string,
    baseUrl: string
  ): ScoredCandidate[] {
    const normalizedText = text.toLowerCase()
    const candidates: ScoredCandidate[] = []

    const matches = $('a, button').filter((_i, el) =>
      $(el).text().toLowerCase().trim().includes(normalizedText)
    )

    for (let i = 0; i < matches.length; i++) {
      const el = matches.eq(i)
      const href = el.attr('href')
      if (!href) continue

      const resolvedUrl = this.resolveUrl(href, baseUrl)
      if (!resolvedUrl) continue

      const score = this.scoreCandidate(resolvedUrl, baseUrl, el.text())
      if (score < 0) continue

      candidates.push({
        score,
        result: {
          downloadUrl: resolvedUrl,
          filename: this.extractFilename(resolvedUrl),
          fileType: this.detectFileType(resolvedUrl)
        }
      })
    }

    return candidates
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
