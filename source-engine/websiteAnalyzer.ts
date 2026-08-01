import * as cheerio from 'cheerio'
import { AnalysisResult, DetectedLink, DetectedButton, SuggestedRules, PageMetadata } from './types'

/** A cheerio-wrapped node, i.e. whatever `$(...)` returns. */
type WrappedElement = ReturnType<cheerio.CheerioAPI>

const DOWNLOAD_KEYWORDS = [
  'download', 'install', 'get', 'free download', 'apk download',
  'direct download', 'latest version', 'download apk'
]

const APK_EXTENSIONS = ['.apk', '.xapk', '.apks', '.zip']

export class WebsiteAnalyzer {
  async analyze(url: string): Promise<AnalysisResult> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow'
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch page: HTTP ${response.status}`)
    }

    const html = await response.text()
    return this.analyzeHtml(html, url)
  }

  analyzeHtml(html: string, baseUrl: string): AnalysisResult {
    const $ = cheerio.load(html)
    const domain = new URL(baseUrl).hostname.replace(/^www\./, '')

    const detectedLinks = this.findDownloadLinks($, baseUrl)
    const detectedButtons = this.findDownloadButtons($)
    const metadata = this.extractPageMetadata($)
    const suggestedRules = this.generateRules(detectedLinks, detectedButtons)
    const confidence = this.calculateConfidence(detectedLinks, detectedButtons)

    return {
      domain,
      title: $('title').text().trim(),
      detectedLinks,
      detectedButtons,
      suggestedRules,
      confidence,
      metadata
    }
  }

  private findDownloadLinks($: cheerio.CheerioAPI, baseUrl: string): DetectedLink[] {
    const links: DetectedLink[] = []
    const seen = new Set<string>()

    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') || ''
      const text = $(el).text().trim()
      const fullUrl = this.resolveUrl(href, baseUrl)
      if (!fullUrl || seen.has(fullUrl)) return
      seen.add(fullUrl)

      const hrefLower = fullUrl.toLowerCase()
      let confidence = 0
      let fileExtension: string | undefined

      for (const ext of APK_EXTENSIONS) {
        if (hrefLower.includes(ext)) {
          fileExtension = ext.replace('.', '')
          confidence += 40
          break
        }
      }

      const textLower = text.toLowerCase()
      for (const keyword of DOWNLOAD_KEYWORDS) {
        if (textLower.includes(keyword)) {
          confidence += 20
          break
        }
      }

      if (hrefLower.includes('download') || hrefLower.includes('/dl/')) {
        confidence += 15
      }

      if (confidence > 0) {
        const selector = this.buildSelector($(el))
        links.push({ url: fullUrl, text, selector, fileExtension, confidence })
      }
    })

    return links.sort((a, b) => b.confidence - a.confidence)
  }

  private findDownloadButtons($: cheerio.CheerioAPI): DetectedButton[] {
    const buttons: DetectedButton[] = []

    $('a, button, [role="button"]').each((_i, el) => {
      const text = $(el).text().trim().toLowerCase()
      const href = $(el).attr('href')
      let confidence = 0

      for (const keyword of DOWNLOAD_KEYWORDS) {
        if (text.includes(keyword)) {
          confidence += 30
          break
        }
      }

      const classes = ($(el).attr('class') || '').toLowerCase()
      if (classes.includes('download') || classes.includes('btn-download') || classes.includes('dl-btn')) {
        confidence += 25
      }

      const id = ($(el).attr('id') || '').toLowerCase()
      if (id.includes('download')) {
        confidence += 20
      }

      if (confidence > 0) {
        const selector = this.buildSelector($(el))
        buttons.push({
          text: $(el).text().trim(),
          selector,
          href: href || undefined,
          confidence
        })
      }
    })

    return buttons.sort((a, b) => b.confidence - a.confidence)
  }

  private extractPageMetadata($: cheerio.CheerioAPI): PageMetadata {
    return {
      title: $('title').text().trim() || undefined,
      description: $('meta[name="description"]').attr('content') || undefined,
      ogTitle: $('meta[property="og:title"]').attr('content') || undefined,
      ogImage: $('meta[property="og:image"]').attr('content') || undefined,
      appName: $('h1').first().text().trim() || undefined,
      packageName: $('meta[name="package"]').attr('content') || undefined
    }
  }

  private generateRules(
    links: DetectedLink[],
    buttons: DetectedButton[]
  ): SuggestedRules {
    const rules: SuggestedRules = { fallbackSelectors: [] }

    const bestLink = links[0]
    if (bestLink) {
      rules.downloadLinkSelector = bestLink.selector
    }

    const bestButton = buttons[0]
    if (bestButton) {
      rules.downloadPageSelector = bestButton.selector
    }

    rules.fallbackSelectors = [
      ...links.slice(1, 3).map((l) => l.selector),
      ...buttons.slice(1, 3).map((b) => b.selector)
    ]

    rules.appNameSelector = 'h1'

    return rules
  }

  private calculateConfidence(
    links: DetectedLink[],
    buttons: DetectedButton[]
  ): number {
    if (links.length === 0 && buttons.length === 0) return 0

    let confidence = 0

    if (links.length > 0) {
      confidence += Math.min(links[0].confidence, 50)
    }

    if (buttons.length > 0) {
      confidence += Math.min(buttons[0].confidence, 30)
    }

    if (links.some((l) => l.fileExtension)) {
      confidence += 20
    }

    return Math.min(confidence, 100)
  }

  private buildSelector(element: WrappedElement): string {
    const id = element.attr('id')
    if (id) return `#${id}`

    const tag = (element.prop('tagName') || 'div').toLowerCase()
    const classes = (element.attr('class') || '').trim().split(/\s+/).filter(Boolean)

    if (classes.length > 0) {
      const classSelector = classes.slice(0, 2).map((c) => `.${c}`).join('')
      return `${tag}${classSelector}`
    }

    const href = element.attr('href')
    if (href && href.length < 100) {
      return `${tag}[href="${href}"]`
    }

    return tag
  }

  private resolveUrl(href: string, baseUrl: string): string | null {
    try {
      if (href.startsWith('http://') || href.startsWith('https://')) return href
      if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:')) return null
      return new URL(href, baseUrl).toString()
    } catch {
      return null
    }
  }
}
