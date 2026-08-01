import { BrowserManager } from './browserManager'
import { AnalysisResult, DetectedLink, DetectedButton, PageMetadata, SuggestedRules } from '@source-engine/types'

const DOWNLOAD_KEYWORDS = [
  'download', 'install', 'get', 'free download', 'apk download',
  'direct download', 'latest version'
]

export class PageAnalyzer {
  constructor(private browserManager: BrowserManager) {}

  async analyzePage(url: string): Promise<AnalysisResult> {
    const context = await this.browserManager.getContext()
    const page = await context.newPage()

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

      const domain = new URL(url).hostname.replace(/^www\./, '')
      const title = await page.title()

      const detectedLinks = await page.evaluate((keywords: string[]) => {
        const links: Array<{ url: string; text: string; selector: string; fileExtension?: string; confidence: number }> = []
        const anchors = document.querySelectorAll('a[href]')

        anchors.forEach((a) => {
          const href = (a as HTMLAnchorElement).href
          const text = a.textContent?.trim() || ''
          let confidence = 0
          let fileExtension: string | undefined

          const hrefLower = href.toLowerCase()
          const extensions = ['.apk', '.xapk', '.apks']
          for (const ext of extensions) {
            if (hrefLower.includes(ext)) {
              fileExtension = ext.replace('.', '')
              confidence += 40
              break
            }
          }

          const textLower = text.toLowerCase()
          for (const keyword of keywords) {
            if (textLower.includes(keyword)) {
              confidence += 20
              break
            }
          }

          if (confidence > 0) {
            const id = a.id ? `#${a.id}` : ''
            const classes = Array.from(a.classList).slice(0, 2).map(c => `.${c}`).join('')
            const selector = id || `a${classes}` || `a[href="${href}"]`
            links.push({ url: href, text, selector, fileExtension, confidence })
          }
        })

        return links.sort((a, b) => b.confidence - a.confidence).slice(0, 10)
      }, DOWNLOAD_KEYWORDS) as DetectedLink[]

      const detectedButtons = await page.evaluate((keywords: string[]) => {
        const buttons: Array<{ text: string; selector: string; href?: string; confidence: number }> = []
        const elements = document.querySelectorAll('a, button, [role="button"]')

        elements.forEach((el) => {
          const text = el.textContent?.trim() || ''
          let confidence = 0

          const textLower = text.toLowerCase()
          for (const keyword of keywords) {
            if (textLower.includes(keyword)) {
              confidence += 30
              break
            }
          }

          const classes = (el.getAttribute('class') || '').toLowerCase()
          if (classes.includes('download') || classes.includes('dl-btn')) {
            confidence += 25
          }

          if (confidence > 0) {
            const id = el.id ? `#${el.id}` : ''
            const classList = Array.from(el.classList).slice(0, 2).map(c => `.${c}`).join('')
            const tag = el.tagName.toLowerCase()
            const selector = id || `${tag}${classList}`
            buttons.push({
              text,
              selector,
              href: (el as HTMLAnchorElement).href || undefined,
              confidence
            })
          }
        })

        return buttons.sort((a, b) => b.confidence - a.confidence).slice(0, 10)
      }, DOWNLOAD_KEYWORDS) as DetectedButton[]

      const metadata = await page.evaluate(() => {
        const getMeta = (name: string) =>
          document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content') || undefined

        return {
          title: document.title || undefined,
          description: getMeta('description'),
          ogTitle: getMeta('og:title'),
          ogImage: getMeta('og:image'),
          appName: document.querySelector('h1')?.textContent?.trim() || undefined,
          packageName: getMeta('package')
        }
      }) as PageMetadata

      const suggestedRules: SuggestedRules = {
        downloadLinkSelector: detectedLinks[0]?.selector,
        downloadPageSelector: detectedButtons[0]?.selector,
        appNameSelector: 'h1',
        fallbackSelectors: [
          ...detectedLinks.slice(1, 3).map((l) => l.selector),
          ...detectedButtons.slice(1, 3).map((b) => b.selector)
        ]
      }

      const confidence = Math.min(
        (detectedLinks.length > 0 ? 40 : 0) +
        (detectedButtons.length > 0 ? 30 : 0) +
        (detectedLinks.some((l) => l.fileExtension) ? 20 : 0) +
        (metadata.appName ? 10 : 0),
        100
      )

      return { domain, title, detectedLinks, detectedButtons, suggestedRules, confidence, metadata }
    } finally {
      await page.close()
    }
  }
}
