export interface DetectionResult {
  type: 'direct_apk' | 'known_source' | 'unknown'
  confidence: number
  domain?: string
  sourceId?: string
  sourceName?: string
  fileExtension?: string
  url: string
}

export interface ParsedDownload {
  downloadUrl: string
  filename: string
  fileSize?: number
  fileType: 'apk' | 'xapk' | 'apks' | 'zip' | 'unknown'
  appName?: string
  packageName?: string
  version?: string
}

export interface AnalysisResult {
  domain: string
  title: string
  detectedLinks: DetectedLink[]
  detectedButtons: DetectedButton[]
  suggestedRules: SuggestedRules
  confidence: number
  metadata: PageMetadata
}

export interface DetectedLink {
  url: string
  text: string
  selector: string
  fileExtension?: string
  confidence: number
}

export interface DetectedButton {
  text: string
  selector: string
  href?: string
  confidence: number
}

export interface SuggestedRules {
  downloadLinkSelector?: string
  downloadPageSelector?: string
  appNameSelector?: string
  versionSelector?: string
  fallbackSelectors: string[]
}

export interface PageMetadata {
  title?: string
  description?: string
  ogTitle?: string
  ogImage?: string
  appName?: string
  packageName?: string
}
