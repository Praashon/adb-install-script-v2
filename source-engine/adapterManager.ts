import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { SourceRepository } from '@core/database/repositories/sourceRepository'
import { AdapterRepository } from '@core/database/repositories/adapterRepository'
import { AdapterValidator, AdapterRules, AdapterManifest } from '@security-engine/adapterValidator'
import { AdapterSandbox, SandboxedAdapter } from '@security-engine/sandbox'

export interface LoadedAdapter {
  sourceId: string
  manifest: AdapterManifest
  rules: AdapterRules
  sandboxed: SandboxedAdapter
}

export class AdapterManager {
  private validator = new AdapterValidator()
  private sandbox = new AdapterSandbox()
  private loadedAdapters = new Map<string, LoadedAdapter>()

  constructor(
    private sourceRepo: SourceRepository,
    private adapterRepo: AdapterRepository,
    private pluginsDir: string
  ) {}

  async loadAll(): Promise<void> {
    this.loadedAdapters.clear()

    if (!existsSync(this.pluginsDir)) return

    const pluginDirs = readdirSync(this.pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    for (const pluginName of pluginDirs) {
      try {
        await this.loadPlugin(pluginName)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Failed to load plugin "${pluginName}": ${message}`)
      }
    }
  }

  private async loadPlugin(pluginName: string): Promise<void> {
    const pluginDir = join(this.pluginsDir, pluginName)
    const manifestPath = join(pluginDir, 'manifest.json')

    if (!existsSync(manifestPath)) return

    const rawManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    const manifestResult = this.validator.validateManifest(rawManifest)

    if (!manifestResult.valid) {
      throw new Error(`Invalid manifest: ${manifestResult.errors.join(', ')}`)
    }

    const manifest = rawManifest as AdapterManifest
    const version = manifest.currentVersion

    const adapterPath = join(pluginDir, `v${version}`, 'adapter.json')
    if (!existsSync(adapterPath)) {
      throw new Error(`Adapter v${version} not found at ${adapterPath}`)
    }

    const rawRules = JSON.parse(readFileSync(adapterPath, 'utf-8'))
    const rulesResult = this.validator.validateAdapterRules(rawRules)

    if (!rulesResult.valid) {
      throw new Error(`Invalid adapter rules: ${rulesResult.errors.join(', ')}`)
    }

    const rules = rawRules as AdapterRules

    let source = this.sourceRepo.findByDomain(manifest.domain)
    if (!source) {
      const sourceId = this.sourceRepo.create({
        domain: manifest.domain,
        name: manifest.name,
        url: `https://${manifest.domain}`,
        pluginPath: pluginDir,
        isBuiltIn: true
      })
      source = this.sourceRepo.findById(sourceId)!
    }

    const existingAdapter = this.adapterRepo.findActiveBySourceId(source.id)
    if (!existingAdapter || existingAdapter.version < version) {
      if (existingAdapter) {
        this.adapterRepo.deactivate(existingAdapter.id)
      }
      this.adapterRepo.create({
        sourceId: source.id,
        version,
        rules: rules.rules as Record<string, unknown>,
        downloadStrategy: rules.downloadStrategy
      })
    }

    const sandboxed = this.sandbox.wrap(rules)

    this.loadedAdapters.set(manifest.domain, {
      sourceId: source.id,
      manifest,
      rules,
      sandboxed
    })
  }

  getAdapter(domain: string): LoadedAdapter | undefined {
    const adapter = this.loadedAdapters.get(domain)
    if (adapter) return adapter

    const baseDomain = domain.split('.').slice(-2).join('.')
    return this.loadedAdapters.get(baseDomain)
  }

  getAdapterBySourceId(sourceId: string): LoadedAdapter | undefined {
    for (const adapter of this.loadedAdapters.values()) {
      if (adapter.sourceId === sourceId) return adapter
    }
    return undefined
  }

  getAllAdapters(): LoadedAdapter[] {
    return Array.from(this.loadedAdapters.values())
  }

  async saveCustomAdapter(
    name: string,
    domain: string,
    rules: AdapterRules,
    customPluginsDir: string
  ): Promise<string> {
    const fullResult = this.validator.validateAdapterRules(rules)
    if (!fullResult.valid) {
      throw new Error(`Adapter validation failed: ${fullResult.errors.join(', ')}`)
    }

    const manifest: AdapterManifest = {
      id: domain.replace(/\./g, '-'),
      name,
      description: `Custom adapter for ${domain}`,
      domain,
      author: 'user',
      supportedFormats: ['apk', 'xapk'],
      currentVersion: 1,
      status: 'healthy',
      createdAt: new Date().toISOString()
    }

    const pluginDir = join(customPluginsDir, manifest.id)
    const versionDir = join(pluginDir, 'v1')

    const { mkdirSync, writeFileSync } = await import('fs')
    mkdirSync(versionDir, { recursive: true })
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    writeFileSync(join(versionDir, 'adapter.json'), JSON.stringify(rules, null, 2))

    const sourceId = this.sourceRepo.create({
      domain,
      name,
      url: `https://${domain}`,
      pluginPath: pluginDir,
      isBuiltIn: false
    })

    this.adapterRepo.create({
      sourceId,
      version: 1,
      rules: rules.rules as Record<string, unknown>,
      downloadStrategy: rules.downloadStrategy
    })

    const sandboxed = this.sandbox.wrap(rules)
    this.loadedAdapters.set(domain, {
      sourceId,
      manifest,
      rules,
      sandboxed
    })

    return sourceId
  }

  removeAdapter(domain: string): void {
    this.loadedAdapters.delete(domain)
  }
}
