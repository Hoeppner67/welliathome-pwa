import type { Entity, ISODate } from './base'

export interface WeightEntry extends Entity {
  birdId: string
  weight: number
  date: ISODate
  notes?: string
}
