import type { Entity } from './base'

export interface Favorite extends Entity {
  itemType: string
  itemId: string
  title?: string
}
