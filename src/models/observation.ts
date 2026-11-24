import type { Entity, ISODate } from './base'

export interface Observation extends Entity {
  birdId?: string
  title?: string
  description: string
  date: ISODate
  category?: string
}
