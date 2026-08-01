import { AdapterRepository } from "@core/database/repositories/adapterRepository";
import { SourceRepository } from "@core/database/repositories/sourceRepository";
import { EventBus } from "@core/event-bus/eventBus";
export interface HealthStatus {
  sourceId: string;
  sourceName: string;
  domain: string;
  status: "healthy" | "degraded" | "broken";
  successRate: number;
  totalAttempts: number;
  failureCount: number;
  lastTested?: Date;
  activeAdapterVersion?: number;
}
export class HealthChecker {
  constructor(
    private sourceRepo: SourceRepository,
    private adapterRepo: AdapterRepository,
    private eventBus: EventBus,
  ) {}
  getHealthStatus(): HealthStatus[] {
    const sources = this.sourceRepo.findAll();
    const statuses: HealthStatus[] = [];
    for (const source of sources) {
      const adapter = this.adapterRepo.findActiveBySourceId(source.id);
      let status: HealthStatus["status"] = "healthy";
      let successRate = 100;
      let totalAttempts = 0;
      let failureCount = 0;
      if (adapter) {
        successRate = adapter.successRate;
        totalAttempts = adapter.totalAttempts;
        failureCount = adapter.failureCount;
        if (successRate < 50) {
          status = "broken";
        } else if (successRate < 80) {
          status = "degraded";
        }
      }
      statuses.push({
        sourceId: source.id,
        sourceName: source.name,
        domain: source.domain,
        status,
        successRate,
        totalAttempts,
        failureCount,
        lastTested: adapter?.lastTested ?? undefined,
        activeAdapterVersion: adapter?.version,
      });
    }
    return statuses;
  }
  async checkSource(sourceId: string): Promise<HealthStatus | null> {
    const source = this.sourceRepo.findById(sourceId);
    if (!source) return null;
    const adapter = this.adapterRepo.findActiveBySourceId(sourceId);
    if (!adapter) {
      return {
        sourceId,
        sourceName: source.name,
        domain: source.domain,
        status: "broken",
        successRate: 0,
        totalAttempts: 0,
        failureCount: 0,
      };
    }
    let status: HealthStatus["status"] = "healthy";
    try {
      const response = await fetch(`https://${source.domain}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        status = "degraded";
      }
    } catch {
      status = "broken";
    }
    this.sourceRepo.updateStatus(sourceId, status);
    this.eventBus.source("info", `Health check: ${source.name} is ${status}`, {
      sourceId,
      status,
    });
    return {
      sourceId,
      sourceName: source.name,
      domain: source.domain,
      status,
      successRate: adapter.successRate,
      totalAttempts: adapter.totalAttempts,
      failureCount: adapter.failureCount,
      lastTested: new Date(),
      activeAdapterVersion: adapter.version,
    };
  }
}
