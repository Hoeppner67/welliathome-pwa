import type { Entity, ISODate } from './base'

export interface HealthEvent extends Entity {
  birdId?: string
  title: string
  description: string
  date: ISODate
  severity?: string
  resolved?: boolean
  notes?: string
}
