import { setTimeout as delay } from "timers/promises";
export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};
export class RetryManager {
  private attempts = new Map<string, number>();
  private policy: RetryPolicy;
  constructor(policy?: Partial<RetryPolicy>) {
    this.policy = { ...DEFAULT_RETRY_POLICY, ...policy };
  }
  shouldRetry(key: string): boolean {
    const count = this.attempts.get(key) ?? 0;
    return count < this.policy.maxRetries;
  }
  recordAttempt(key: string): number {
    const count = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, count);
    return count;
  }
  getDelay(key: string): number {
    const attempt = this.attempts.get(key) ?? 0;
    const delay =
      this.policy.baseDelayMs *
      Math.pow(this.policy.backoffMultiplier, attempt);
    return Math.min(delay, this.policy.maxDelayMs);
  }
  async waitForRetry(key: string, signal?: AbortSignal): Promise<void> {
    await delay(this.getDelay(key), undefined, { signal }).catch((error) => { if (!signal?.aborted) throw error; });
  }
  reset(key: string): void {
    this.attempts.delete(key);
  }
  resetAll(): void {
    this.attempts.clear();
  }
  getAttemptCount(key: string): number {
    return this.attempts.get(key) ?? 0;
  }
  getRemainingRetries(key: string): number {
    return Math.max(0, this.policy.maxRetries - (this.attempts.get(key) ?? 0));
  }
}
