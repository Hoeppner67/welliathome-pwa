import type { Entity, ISODate } from './base'

export interface Reminder extends Entity {
  birdId?: string
  title: string
  description?: string
  dueDate: ISODate
  completed: boolean
  reminderType: string
}
