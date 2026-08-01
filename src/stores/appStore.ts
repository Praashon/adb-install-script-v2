import { create } from "zustand";
import type { Device, Job, Source } from "@/types";
export type ToastKind = "success" | "error" | "info" | "warning";
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}
export interface LiveLog {
  id: number;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
  jobId?: string;
  timestamp: number;
}
interface AppState {
  devices: Device[];
  sources: Source[];
  jobs: Job[];
  logs: LiveLog[];
  toasts: Toast[];
  adbAvailable: boolean;
  adbError: string | null;
  activeJobId: string | null;
  setDevices: (devices: Device[]) => void;
  setSources: (sources: Source[]) => void;
  setJobs: (jobs: Job[]) => void;
  upsertJob: (job: Job) => void;
  patchJob: (id: string, updates: Partial<Job>) => void;
  removeJob: (id: string) => void;
  addLog: (entry: Omit<LiveLog, "id">) => void;
  clearLogs: () => void;
  setAdbStatus: (available: boolean, error?: string | null) => void;
  setActiveJob: (id: string | null) => void;
  pushToast: (toast: Omit<Toast, "id">) => number;
  dismissToast: (id: number) => void;
  preferredDevice: () => Device | undefined;
}
let logIdCounter = 0;
let toastIdCounter = 0;
export const useAppStore = create<AppState>((set, get) => ({
  devices: [],
  sources: [],
  jobs: [],
  logs: [],
  toasts: [],
  adbAvailable: true,
  adbError: null,
  activeJobId: null,
  setDevices: (devices) => set({ devices }),
  setSources: (sources) => set({ sources }),
  setJobs: (jobs) => set({ jobs }),
  upsertJob: (job) =>
    set((state) => {
      const index = state.jobs.findIndex((j) => j.id === job.id);
      if (index === -1) return { jobs: [job, ...state.jobs] };
      const jobs = [...state.jobs];
      jobs[index] = { ...jobs[index], ...job };
      return { jobs };
    }),
  patchJob: (id, updates) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
    })),
  removeJob: (id) =>
    set((state) => ({
      jobs: state.jobs.filter((j) => j.id !== id),
      activeJobId: state.activeJobId === id ? null : state.activeJobId,
    })),
  addLog: (entry) =>
    set((state) => ({
      logs: [{ ...entry, id: ++logIdCounter }, ...state.logs].slice(0, 500),
    })),
  clearLogs: () => set({ logs: [] }),
  setAdbStatus: (available, error = null) =>
    set({ adbAvailable: available, adbError: error }),
  setActiveJob: (id) => set({ activeJobId: id }),
  pushToast: (toast) => {
    const id = ++toastIdCounter;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  preferredDevice: () => {
    const { devices } = get();
    return (
      devices.find((d) => d.isPreferred && d.status === "online") ??
      devices.find((d) => d.status === "online")
    );
  },
}));
export const notify = {
  success: (title: string, description?: string) =>
    useAppStore.getState().pushToast({ kind: "success", title, description }),
  error: (title: string, description?: string) =>
    useAppStore.getState().pushToast({ kind: "error", title, description }),
  info: (title: string, description?: string) =>
    useAppStore.getState().pushToast({ kind: "info", title, description }),
  warning: (title: string, description?: string) =>
    useAppStore.getState().pushToast({ kind: "warning", title, description }),
};
