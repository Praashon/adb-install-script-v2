import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { createHash } from 'crypto'
import { DownloadRepository } from '@core/database/repositories/downloadRepository'

export interface VerificationResult {
  valid: boolean
  sha256: string
  fileSize: number
  mimeType?: string
  isDuplicate: boolean
  duplicateDownloadId?: string
  errors: string[]
}

const APK_MIME_TYPES = new Set([
  'application/vnd.android.package-archive',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed'
])

export class DownloadVerifier {
  constructor(private downloadRepo: DownloadRepository) {}

  async verify(filePath: string, expectedSize?: number, expectedMime?: string): Promise<VerificationResult> {
    const errors: string[] = []

    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat) {
      return {
        valid: false,
        sha256: '',
        fileSize: 0,
        isDuplicate: false,
        errors: ['File does not exist']
      }
    }

    const fileSize = fileStat.size

    if (fileSize === 0) {
      errors.push('Downloaded file is empty')
    }

    if (expectedSize && Math.abs(fileSize - expectedSize) > 1024) {
      errors.push(`File size mismatch: expected ${expectedSize}, got ${fileSize}`)
    }

    if (expectedMime && !APK_MIME_TYPES.has(expectedMime)) {
      errors.push(`Unexpected MIME type: ${expectedMime}`)
    }

    const sha256 = await this.computeSha256(filePath)

    let isDuplicate = false
    let duplicateDownloadId: string | undefined

    const existing = this.downloadRepo.findBySha256(sha256)
    if (existing) {
      isDuplicate = true
      duplicateDownloadId = existing.id
    }

    return {
      valid: errors.length === 0,
      sha256,
      fileSize,
      mimeType: expectedMime,
      isDuplicate,
      duplicateDownloadId,
      errors
    }
  }

  private computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)

      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }
}
