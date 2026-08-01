import { AdapterRepository } from "@core/database/repositories/adapterRepository";
import { SourceRepository } from "@core/database/repositories/sourceRepository";
import { EventBus } from "@core/event-bus/eventBus";
const BROKEN_THRESHOLD = 0.5;
const DEGRADED_THRESHOLD = 0.8;
export class FailureTracker {
  constructor(
    private sourceRepo: SourceRepository,
    private adapterRepo: AdapterRepository,
    private eventBus: EventBus,
  ) {}
  recordSuccess(sourceId: string): void {
    const adapter = this.adapterRepo.findActiveBySourceId(sourceId);
    if (!adapter) return;
    this.adapterRepo.recordSuccess(adapter.id);
    const source = this.sourceRepo.findById(sourceId);
    if (source && source.status !== "healthy") {
      const updated = this.adapterRepo.findById(adapter.id);
      if (updated && updated.successRate >= DEGRADED_THRESHOLD * 100) {
        this.sourceRepo.updateStatus(sourceId, "healthy");
        this.eventBus.source(
          "info",
          `Source "${source.name}" recovered to healthy status`,
        );
      }
    }
  }
  recordFailure(sourceId: string, error: string): void {
    const adapter = this.adapterRepo.findActiveBySourceId(sourceId);
    if (!adapter) return;
    this.adapterRepo.recordFailure(adapter.id);
    const updated = this.adapterRepo.findById(adapter.id);
    if (!updated) return;
    const source = this.sourceRepo.findById(sourceId);
    if (!source) return;
    if (updated.successRate < BROKEN_THRESHOLD * 100) {
      this.sourceRepo.updateStatus(sourceId, "broken");
      this.eventBus.source("warn", `Source "${source.name}" marked as broken`, {
        sourceId,
        successRate: updated.successRate,
        error,
      });
    } else if (updated.successRate < DEGRADED_THRESHOLD * 100) {
      this.sourceRepo.updateStatus(sourceId, "degraded");
      this.eventBus.source("warn", `Source "${source.name}" degraded`, {
        sourceId,
        successRate: updated.successRate,
      });
    }
  }
}
