import { create } from 'zustand'

interface Device {
  serial: string
  model: string
  manufacturer: string
  androidVersion: string
  architecture: string
  status: string
  isPreferred?: boolean
}

interface Source {
  id: string
  domain: string
  name: string
  url: string
  status: string
  isBuiltIn: boolean
}

interface Job {
  id: string
  type: string
  url: string
  status: string
  progress: number
  currentStep: string | null
  error: string | null
  createdAt: number
}

interface LogEntry {
  id: number
  level: string
  source: string
  message: string
  data?: Record<string, unknown>
  timestamp: number
}

interface AppState {
  devices: Device[]
  sources: Source[]
  jobs: Job[]
  logs: LogEntry[]
  activeJobId: string | null
  preferredDeviceSerial: string | null
  sidebarCollapsed: boolean

  setDevices: (devices: Device[]) => void
  setSources: (sources: Source[]) => void
  setJobs: (jobs: Job[]) => void
  addJob: (job: Job) => void
  updateJob: (id: string, updates: Partial<Job>) => void
  removeJob: (id: string) => void
  addLog: (entry: Omit<LogEntry, 'id'>) => void
  clearLogs: () => void
  setActiveJob: (id: string | null) => void
  setPreferredDevice: (serial: string | null) => void
  toggleSidebar: () => void
}

let logIdCounter = 0

export const useAppStore = create<AppState>((set) => ({
  devices: [],
  sources: [],
  jobs: [],
  logs: [],
  activeJobId: null,
  preferredDeviceSerial: null,
  sidebarCollapsed: false,

  setDevices: (devices) => set({ devices }),
  setSources: (sources) => set({ sources }),
  setJobs: (jobs) => set({ jobs }),

  addJob: (job) =>
    set((state) => ({ jobs: [job, ...state.jobs] })),

  updateJob: (id, updates) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j))
    })),

  removeJob: (id) =>
    set((state) => ({
      jobs: state.jobs.filter((j) => j.id !== id),
      activeJobId: state.activeJobId === id ? null : state.activeJobId
    })),

  addLog: (entry) =>
    set((state) => ({
      logs: [{ ...entry, id: ++logIdCounter }, ...state.logs].slice(0, 500)
    })),

  clearLogs: () => set({ logs: [] }),

  setActiveJob: (id) => set({ activeJobId: id }),
  setPreferredDevice: (serial) => set({ preferredDeviceSerial: serial }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}))
