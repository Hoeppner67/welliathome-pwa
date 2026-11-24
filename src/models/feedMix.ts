import type { Entity } from './base'

export interface FeedMix extends Entity {
  name: string
  provider?: string
  ingredients: string[]
  productUrl?: string
  notes?: string
}
