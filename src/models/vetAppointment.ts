import type { Entity, ISODate } from './base'

export interface VetAppointment extends Entity {
  birdId?: string
  date: ISODate
  title: string
  veterinarian?: string
  reason?: string
  diagnosis?: string
  notes?: string
  completed?: boolean
}
