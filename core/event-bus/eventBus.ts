import { EventEmitter } from 'events'

export type EventLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AppEvent {
  source: string
  level: EventLevel
  message: string
  data?: Record<string, unknown>
  jobId?: string
  timestamp: number
}

export type EventHandler = (event: AppEvent) => void
type WildcardHandler = (eventName: string, event: AppEvent) => void

export class EventBus {
  private emitter = new EventEmitter()
  private wildcardHandlers: WildcardHandler[] = []

  constructor() {
    this.emitter.setMaxListeners(100)
  }

  emit(eventName: string, event: Omit<AppEvent, 'timestamp'>): void {
    const full: AppEvent = { ...event, timestamp: Date.now() }
    this.emitter.emit(eventName, full)
    for (const handler of this.wildcardHandlers) {
      handler(eventName, full)
    }
  }

  on(eventName: string, handler: EventHandler): () => void {
    this.emitter.on(eventName, handler)
    return () => this.emitter.removeListener(eventName, handler)
  }

  once(eventName: string, handler: EventHandler): void {
    this.emitter.once(eventName, handler)
  }

  off(eventName: string, handler: EventHandler): void {
    this.emitter.removeListener(eventName, handler)
  }

  onAny(handler: WildcardHandler): () => void {
    this.wildcardHandlers.push(handler)
    return () => {
      const index = this.wildcardHandlers.indexOf(handler)
      if (index >= 0) this.wildcardHandlers.splice(index, 1)
    }
  }

  job(jobId: string, level: EventLevel, message: string, data?: Record<string, unknown>): void {
    this.emit(`job:${jobId}`, {
      source: 'job-manager',
      level,
      message,
      data,
      jobId
    })
    this.emit('job:update', {
      source: 'job-manager',
      level,
      message,
      data: { ...data, jobId },
      jobId
    })
  }

  source(level: EventLevel, message: string, data?: Record<string, unknown>): void {
    this.emit('source:event', { source: 'source-engine', level, message, data })
  }

  download(level: EventLevel, message: string, data?: Record<string, unknown>): void {
    this.emit('download:event', { source: 'download-engine', level, message, data })
  }

  adb(level: EventLevel, message: string, data?: Record<string, unknown>): void {
    this.emit('adb:event', { source: 'adb-engine', level, message, data })
  }

  log(source: string, level: EventLevel, message: string, data?: Record<string, unknown>): void {
    this.emit('log', { source, level, message, data })
  }

  removeAllForJob(jobId: string): void {
    this.emitter.removeAllListeners(`job:${jobId}`)
  }

  destroy(): void {
    this.emitter.removeAllListeners()
    this.wildcardHandlers = []
  }
}
