import {
  ALLOWED_TOP_LEVEL_KEYS,
  ALLOWED_RULE_KEYS,
  ALLOWED_METADATA_KEYS,
  validateKeys,
  scanStringValues
} from './permissionPolicy'

export interface AdapterManifest {
  id: string
  name: string
  description: string
  domain: string
  author: string
  supportedFormats: string[]
  currentVersion: number
  status: string
  createdAt: string
}

export interface AdapterRules {
  version: number
  parserType: 'html' | 'json' | 'regex'
  rules: {
    downloadPageSelector?: string
    downloadLinkSelector?: string
    appNameSelector?: string
    versionSelector?: string
    sizeSelector?: string
    packageNameSelector?: string
    fallbackSelectors?: string[]
    downloadButtonText?: string[]
    linkPattern?: string
    excludePatterns?: string[]
  }
  downloadStrategy: 'direct' | 'html' | 'browser' | 'redirect'
  urlPatterns?: Record<string, string>
  metadata?: {
    requiresBrowser?: boolean
    hasRedirects?: boolean
    maxRedirects?: number
    timeout?: number
    userAgent?: string
    waitForSelector?: string
    waitTimeout?: number
  }
  headers?: Record<string, string>
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export class AdapterValidator {
  validateManifest(data: unknown): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Manifest must be a JSON object'], warnings }
    }

    const manifest = data as Record<string, unknown>

    const requiredFields = ['id', 'name', 'domain', 'supportedFormats', 'currentVersion']
    for (const field of requiredFields) {
      if (!(field in manifest)) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
      errors.push('Field "id" must be a non-empty string')
    }

    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
      errors.push('Field "name" must be a non-empty string')
    }

    // "*" marks the catch-all adapter used when no site-specific one matches.
    if (
      typeof manifest.domain !== 'string' ||
      (manifest.domain !== '*' && !manifest.domain.includes('.'))
    ) {
      errors.push('Field "domain" must be a valid domain name')
    }

    if (!Array.isArray(manifest.supportedFormats)) {
      errors.push('Field "supportedFormats" must be an array')
    } else {
      const validFormats = new Set(['apk', 'xapk', 'apks', 'zip'])
      for (const format of manifest.supportedFormats) {
        if (typeof format !== 'string' || !validFormats.has(format)) {
          errors.push(`Invalid format: ${format}. Allowed: apk, xapk, apks, zip`)
        }
      }
    }

    if (typeof manifest.currentVersion !== 'number' || manifest.currentVersion < 1) {
      errors.push('Field "currentVersion" must be a positive integer')
    }

    errors.push(...scanStringValues(manifest))

    return { valid: errors.length === 0, errors, warnings }
  }

  validateAdapterRules(data: unknown): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Adapter rules must be a JSON object'], warnings }
    }

    const adapter = data as Record<string, unknown>

    errors.push(...validateKeys(adapter, ALLOWED_TOP_LEVEL_KEYS, 'adapter root'))

    if (typeof adapter.version !== 'number' || adapter.version < 1) {
      errors.push('Field "version" must be a positive integer')
    }

    const validParserTypes = new Set(['html', 'json', 'regex'])
    if (typeof adapter.parserType !== 'string' || !validParserTypes.has(adapter.parserType)) {
      errors.push('Field "parserType" must be one of: html, json, regex')
    }

    const validStrategies = new Set(['direct', 'html', 'browser', 'redirect'])
    if (
      typeof adapter.downloadStrategy !== 'string' ||
      !validStrategies.has(adapter.downloadStrategy)
    ) {
      errors.push('Field "downloadStrategy" must be one of: direct, html, browser, redirect')
    }

    if (adapter.rules && typeof adapter.rules === 'object') {
      errors.push(
        ...validateKeys(adapter.rules as Record<string, unknown>, ALLOWED_RULE_KEYS, 'rules')
      )
    }

    if (adapter.metadata && typeof adapter.metadata === 'object') {
      const meta = adapter.metadata as Record<string, unknown>
      errors.push(...validateKeys(meta, ALLOWED_METADATA_KEYS, 'metadata'))

      if (meta.maxRedirects !== undefined) {
        if (typeof meta.maxRedirects !== 'number' || meta.maxRedirects < 0 || meta.maxRedirects > 10) {
          errors.push('metadata.maxRedirects must be a number between 0 and 10')
        }
      }

      if (meta.timeout !== undefined) {
        if (typeof meta.timeout !== 'number' || meta.timeout < 1000 || meta.timeout > 120000) {
          errors.push('metadata.timeout must be between 1000 and 120000 ms')
        }
      }

      if (meta.waitTimeout !== undefined) {
        if (typeof meta.waitTimeout !== 'number' || meta.waitTimeout < 1000 || meta.waitTimeout > 60000) {
          errors.push('metadata.waitTimeout must be between 1000 and 60000 ms')
        }
      }
    }

    if (adapter.headers && typeof adapter.headers === 'object') {
      const headers = adapter.headers as Record<string, unknown>
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value !== 'string') {
          errors.push(`Header "${key}" must be a string value`)
        }
      }
    }

    errors.push(...scanStringValues(adapter))

    return { valid: errors.length === 0, errors, warnings }
  }

  validateFull(manifest: unknown, rules: unknown): ValidationResult {
    const manifestResult = this.validateManifest(manifest)
    const rulesResult = this.validateAdapterRules(rules)

    return {
      valid: manifestResult.valid && rulesResult.valid,
      errors: [...manifestResult.errors, ...rulesResult.errors],
      warnings: [...manifestResult.warnings, ...rulesResult.warnings]
    }
  }
}
