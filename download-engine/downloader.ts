import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { EventBus } from '@core/event-bus/eventBus'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

export interface DownloadOptions {
  url: string
  outputPath: string
  headers?: Record<string, string>
  jobId?: string
  onProgress?: (downloaded: number, total: number | null, speed: number) => void
}

export interface DownloadResult {
  filePath: string
  fileSize: number
  mimeType?: string
  duration: number
}

export class Downloader {
  constructor(private eventBus: EventBus) {}

  async download(options: DownloadOptions): Promise<DownloadResult> {
    const { url, outputPath, headers = {}, jobId } = options

    await mkdir(dirname(outputPath), { recursive: true })

    const startTime = Date.now()

    this.eventBus.download('info', `Starting download: ${url}`, { jobId })

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      },
      redirect: 'follow'
    })

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const contentLength = response.headers.get('content-length')
    const totalSize = contentLength ? parseInt(contentLength, 10) : null
    const mimeType = response.headers.get('content-type') || undefined

    let downloaded = 0
    let lastProgressUpdate = 0
    let lastBytes = 0
    let speed = 0

    const reader = response.body.getReader()
    const writeStream = createWriteStream(outputPath)

    const readable = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read()
          if (done) {
            this.push(null)
            return
          }

          downloaded += value.length
          const now = Date.now()
          const elapsed = now - lastProgressUpdate

          if (elapsed >= 500) {
            speed = ((downloaded - lastBytes) / elapsed) * 1000
            lastProgressUpdate = now
            lastBytes = downloaded

            const progress = totalSize ? (downloaded / totalSize) * 100 : -1

            options.onProgress?.(downloaded, totalSize, speed)
            this.eventBus?.download('info', 'Download progress', {
              downloaded,
              total: totalSize,
              progress: Math.round(progress),
              speed: Math.round(speed),
              jobId
            })
          }

          this.push(value)
        } catch (err) {
          this.destroy(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })

    // Bind eventBus to readable for progress callbacks
    ;(readable as Record<string, unknown>).eventBus = this.eventBus

    await pipeline(readable, writeStream)

    const duration = Date.now() - startTime

    this.eventBus.download('info', 'Download complete', {
      filePath: outputPath,
      fileSize: downloaded,
      duration,
      jobId
    })

    return {
      filePath: outputPath,
      fileSize: downloaded,
      mimeType,
      duration
    }
  }
}
