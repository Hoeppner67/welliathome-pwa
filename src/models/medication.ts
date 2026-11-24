import type { Entity, ISODate } from './base'

export interface Medication extends Entity {
  birdId: string
  name: string
  dosage?: string
  startDate: ISODate
  endDate?: ISODate
  notes?: string
}
