import type { Entity } from './base'

export interface MediaAsset extends Entity {
  fileName: string
  mimeType: string
  fileSize: number
  blob: Blob
  relatedType?: string
  relatedId?: string
}
