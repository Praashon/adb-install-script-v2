import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import {
  deviceService,
  jobService,
  onAppEvent,
  sourceService,
} from "@/services";
import type { Device, Job } from "@/types";
interface EventPayload {
  source: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
  jobId?: string;
  timestamp: number;
}
export function useEventBridge(): void {
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const store = useAppStore.getState();
    const refreshJobs = (): void => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        jobService
          .getAll()
          .then((jobs) => useAppStore.getState().setJobs(jobs))
          .catch(() => undefined);
      }, 250);
    };
    void deviceService
      .list()
      .then((devices) => store.setDevices(devices))
      .catch(() => undefined);
    void jobService
      .getAll()
      .then((jobs) => store.setJobs(jobs))
      .catch(() => undefined);
    void sourceService
      .getAll()
      .then((sources) => store.setSources(sources))
      .catch(() => undefined);
    const unsubscribe = onAppEvent((eventName, rawData) => {
      const payload = rawData as EventPayload;
      const state = useAppStore.getState();
      if (eventName === "device:update") {
        const data = payload.data as
          | {
              devices?: Device[];
              error?: string;
              adbAvailable?: boolean;
            }
          | undefined;
        state.setDevices(data?.devices ?? []);
        state.setAdbStatus(data?.adbAvailable !== false, data?.error ?? null);
        return;
      }
      if (eventName === "window:state") return;
      if (eventName === "job:update" || eventName.startsWith("job:")) {
        const jobId = payload.jobId;
        const data = payload.data ?? {};
        if (jobId) {
          const patch: Partial<Job> = {};
          if (typeof data.progress === "number") patch.progress = data.progress;
          if (typeof data.step === "string") patch.currentStep = data.step;
          if (Object.keys(patch).length > 0) state.patchJob(jobId, patch);
        }
        refreshJobs();
      }
      if (payload.level !== "debug") {
        state.addLog({
          level: payload.level,
          source: payload.source,
          message: payload.message,
          jobId: payload.jobId,
          timestamp: payload.timestamp ?? Date.now(),
        });
      }
    });
    return () => {
      unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);
}
