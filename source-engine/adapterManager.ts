import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  rmSync,
} from "fs";
import { join, resolve, relative, isAbsolute } from "path";
import { SourceRepository } from "@core/database/repositories/sourceRepository";
import { AdapterRepository } from "@core/database/repositories/adapterRepository";
import {
  AdapterValidator,
  AdapterRules,
  AdapterManifest,
} from "@security-engine/adapterValidator";
import { AdapterSandbox, SandboxedAdapter } from "@security-engine/sandbox";
export interface LoadedAdapter {
  sourceId: string;
  manifest: AdapterManifest;
  rules: AdapterRules;
  sandboxed: SandboxedAdapter;
  pluginDir: string;
  isBuiltIn: boolean;
}
export interface AdapterBundle {
  manifest: AdapterManifest;
  rules: AdapterRules;
}
const GENERIC_RULES: AdapterRules = {
  version: 1,
  parserType: "html",
  rules: {
    fallbackSelectors: [
      "a[href$='.apk']",
      "a[href$='.xapk']",
      "a[href$='.apks']",
      "a[href*='download']",
    ],
    downloadButtonText: [
      "Download APK",
      "Download XAPK",
      "Download",
      "Direct Download",
    ],
  },
  downloadStrategy: "html",
  metadata: { requiresBrowser: false, maxRedirects: 5, timeout: 30000 },
};
export class AdapterManager {
  private validator = new AdapterValidator();
  private sandbox = new AdapterSandbox();
  private loadedAdapters = new Map<string, LoadedAdapter>();
  private fallbackAdapter: SandboxedAdapter;
  constructor(
    private sourceRepo: SourceRepository,
    private adapterRepo: AdapterRepository,
    private builtInPluginsDir: string,
    private userPluginsDir: string,
  ) {
    this.fallbackAdapter = this.sandbox.wrap(GENERIC_RULES);
  }
  async loadAll(): Promise<{
    loaded: number;
    failed: {
      plugin: string;
      error: string;
    }[];
  }> {
    this.loadedAdapters.clear();
    this.fallbackAdapter = this.sandbox.wrap(GENERIC_RULES);
    const failed: {
      plugin: string;
      error: string;
    }[] = [];
    let loaded = 0;
    for (const [dir, isBuiltIn] of [
      [this.builtInPluginsDir, true],
      [this.userPluginsDir, false],
    ] as const) {
      if (!existsSync(dir)) continue;
      const pluginDirs = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      for (const pluginName of pluginDirs) {
        try {
          if (await this.loadPlugin(join(dir, pluginName), isBuiltIn)) loaded++;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          failed.push({ plugin: pluginName, error: message });
        }
      }
    }
    return { loaded, failed };
  }
  private async loadPlugin(
    pluginDir: string,
    isBuiltIn: boolean,
  ): Promise<boolean> {
    const manifestPath = join(pluginDir, "manifest.json");
    if (!existsSync(manifestPath)) return false;
    const rawManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const manifestResult = this.validator.validateManifest(rawManifest);
    if (!manifestResult.valid) {
      throw new Error(`Invalid manifest: ${manifestResult.errors.join(", ")}`);
    }
    const manifest = rawManifest as AdapterManifest;
    const version = manifest.currentVersion;
    const adapterPath = join(pluginDir, `v${version}`, "adapter.json");
    if (!existsSync(adapterPath)) {
      throw new Error(`Adapter v${version} not found at ${adapterPath}`);
    }
    const rawRules = JSON.parse(readFileSync(adapterPath, "utf-8"));
    const rulesResult = this.validator.validateAdapterRules(rawRules);
    if (!rulesResult.valid) {
      throw new Error(
        `Invalid adapter rules: ${rulesResult.errors.join(", ")}`,
      );
    }
    const rules = rawRules as AdapterRules;
    const sandboxed = this.sandbox.wrap(rules);
    if (manifest.domain === "*") {
      this.fallbackAdapter = sandboxed;
      return true;
    }
    let source = this.sourceRepo.findByDomain(manifest.domain);
    if (!source) {
      const sourceId = this.sourceRepo.create({
        domain: manifest.domain,
        name: manifest.name,
        url: `https://${manifest.domain}`,
        pluginPath: pluginDir,
        isBuiltIn,
      });
      source = this.sourceRepo.findById(sourceId)!;
    } else if (source.pluginPath !== pluginDir) {
      this.sourceRepo.update(source.id, { pluginPath: pluginDir });
    }
    const existingAdapter = this.adapterRepo.findActiveBySourceId(source.id);
    if (!existingAdapter || existingAdapter.version < version) {
      if (existingAdapter) this.adapterRepo.deactivate(existingAdapter.id);
      this.adapterRepo.create({
        sourceId: source.id,
        version,
        rules: rules.rules as Record<string, unknown>,
        downloadStrategy: rules.downloadStrategy,
      });
    }
    this.loadedAdapters.set(manifest.domain, {
      sourceId: source.id,
      manifest,
      rules,
      sandboxed,
      pluginDir,
      isBuiltIn,
    });
    return true;
  }
  getAdapter(domain: string): LoadedAdapter | undefined {
    if (!domain) return undefined;
    const normalized = domain.replace(/^www\./, "").toLowerCase();
    const exact = this.loadedAdapters.get(normalized);
    if (exact) return exact;
    const baseDomain = normalized.split(".").slice(-2).join(".");
    const base = this.loadedAdapters.get(baseDomain);
    if (base) return base;
    for (const [registered, adapter] of this.loadedAdapters) {
      if (normalized.endsWith(`.${registered}`)) return adapter;
    }
    return undefined;
  }
  getFallbackAdapter(): SandboxedAdapter {
    return this.fallbackAdapter;
  }
  getAdapterBySourceId(sourceId: string): LoadedAdapter | undefined {
    for (const adapter of this.loadedAdapters.values()) {
      if (adapter.sourceId === sourceId) return adapter;
    }
    return undefined;
  }
  getAllAdapters(): LoadedAdapter[] {
    return Array.from(this.loadedAdapters.values());
  }
  async saveCustomAdapter(
    name: string,
    domain: string,
    rules: AdapterRules,
  ): Promise<string> {
    const normalizedDomain = domain.replace(/^www\./, "").toLowerCase();
    const result = this.validator.validateAdapterRules(rules);
    if (!result.valid) {
      throw new Error(`Adapter validation failed: ${result.errors.join(", ")}`);
    }
    if (this.sourceRepo.findByDomain(normalizedDomain)) {
      throw new Error(`An adapter for ${normalizedDomain} already exists`);
    }
    const manifest: AdapterManifest = {
      id: normalizedDomain.replace(/[^a-z0-9]+/g, "-"),
      name,
      description: `Custom adapter for ${normalizedDomain}`,
      domain: normalizedDomain,
      author: "user",
      supportedFormats: ["apk", "xapk", "apks"],
      currentVersion: rules.version ?? 1,
      status: "healthy",
      createdAt: new Date().toISOString(),
    };
    const pluginDir = join(this.userPluginsDir, manifest.id);
    this.writePlugin(pluginDir, manifest, rules);
    const sourceId = this.sourceRepo.create({
      domain: normalizedDomain,
      name,
      url: `https://${normalizedDomain}`,
      pluginPath: pluginDir,
      isBuiltIn: false,
    });
    this.adapterRepo.create({
      sourceId,
      version: manifest.currentVersion,
      rules: rules.rules as Record<string, unknown>,
      downloadStrategy: rules.downloadStrategy,
    });
    this.loadedAdapters.set(normalizedDomain, {
      sourceId,
      manifest,
      rules,
      sandboxed: this.sandbox.wrap(rules),
      pluginDir,
      isBuiltIn: false,
    });
    return sourceId;
  }
  async updateAdapter(
    sourceId: string,
    rules: AdapterRules,
    name?: string,
  ): Promise<void> {
    const source = this.sourceRepo.findById(sourceId);
    if (!source) throw new Error("Source not found");
    const result = this.validator.validateAdapterRules(rules);
    if (!result.valid) {
      throw new Error(`Adapter validation failed: ${result.errors.join(", ")}`);
    }
    const nextVersion = this.adapterRepo.getNextVersion(sourceId);
    const existing = this.loadedAdapters.get(source.domain);
    const pluginDir =
      existing?.pluginDir ??
      source.pluginPath ??
      join(this.userPluginsDir, source.domain.replace(/[^a-z0-9]+/g, "-"));
    const manifest: AdapterManifest = {
      ...(existing?.manifest ?? {
        id: source.domain.replace(/[^a-z0-9]+/g, "-"),
        description: `Adapter for ${source.domain}`,
        domain: source.domain,
        author: "user",
        supportedFormats: ["apk", "xapk", "apks"],
        status: "healthy",
        createdAt: new Date().toISOString(),
      }),
      name: name ?? existing?.manifest.name ?? source.name,
      currentVersion: nextVersion,
    } as AdapterManifest;
    const versionedRules: AdapterRules = { ...rules, version: nextVersion };
    this.writePlugin(pluginDir, manifest, versionedRules);
    const active = this.adapterRepo.findActiveBySourceId(sourceId);
    if (active) this.adapterRepo.deactivate(active.id);
    this.adapterRepo.create({
      sourceId,
      version: nextVersion,
      rules: versionedRules.rules as Record<string, unknown>,
      downloadStrategy: versionedRules.downloadStrategy,
    });
    if (name && name !== source.name) {
      this.sourceRepo.update(sourceId, { name });
    }
    this.sourceRepo.update(sourceId, {
      pluginPath: pluginDir,
      status: "healthy",
    });
    this.loadedAdapters.set(source.domain, {
      sourceId,
      manifest,
      rules: versionedRules,
      sandboxed: this.sandbox.wrap(versionedRules),
      pluginDir,
      isBuiltIn: existing?.isBuiltIn ?? false,
    });
  }
  exportBundle(sourceId: string): AdapterBundle {
    const adapter = this.getAdapterBySourceId(sourceId);
    if (!adapter) throw new Error("No adapter is loaded for this source");
    return { manifest: adapter.manifest, rules: adapter.rules };
  }
  async importBundle(raw: unknown): Promise<string> {
    if (!raw || typeof raw !== "object") {
      throw new Error("Plugin file must contain a JSON object");
    }
    const bundle = raw as Partial<AdapterBundle>;
    if (!bundle.manifest || !bundle.rules) {
      throw new Error('Plugin file must contain both "manifest" and "rules"');
    }
    const full = this.validator.validateFull(bundle.manifest, bundle.rules);
    if (!full.valid) {
      throw new Error(full.errors.join(", "));
    }
    const manifest = bundle.manifest as AdapterManifest;
    const rules = bundle.rules as AdapterRules;
    const domain = manifest.domain.replace(/^www\./, "").toLowerCase();
    const existing = this.sourceRepo.findByDomain(domain);
    if (existing) {
      await this.updateAdapter(existing.id, rules, manifest.name);
      return existing.id;
    }
    return this.saveCustomAdapter(manifest.name, domain, rules);
  }
  removeSource(sourceId: string): void {
    const source = this.sourceRepo.findById(sourceId);
    if (!source) throw new Error("Source not found");
    const adapter = this.getAdapterBySourceId(sourceId);
    if (
      adapter &&
      !adapter.isBuiltIn &&
      relative(resolve(this.userPluginsDir), resolve(adapter.pluginDir)).length > 0 &&
      !relative(resolve(this.userPluginsDir), resolve(adapter.pluginDir)).startsWith("..") &&
      !isAbsolute(relative(resolve(this.userPluginsDir), resolve(adapter.pluginDir)))
    ) {
      rmSync(adapter.pluginDir, { recursive: true, force: true });
    }
    this.loadedAdapters.delete(source.domain);
    this.sourceRepo.remove(sourceId);
  }
  private writePlugin(
    pluginDir: string,
    manifest: AdapterManifest,
    rules: AdapterRules,
  ): void {
    const versionDir = join(pluginDir, `v${manifest.currentVersion}`);
    mkdirSync(versionDir, { recursive: true });
    writeFileSync(
      join(pluginDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
    writeFileSync(
      join(versionDir, "adapter.json"),
      JSON.stringify(rules, null, 2),
      "utf-8",
    );
  }
}
