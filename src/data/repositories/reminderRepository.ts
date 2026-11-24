import type { Reminder } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { validateReminder } from './validators'

export const reminderRepository = new BaseRepository<Reminder>(
  appDatabase.reminders,
  'reminders',
  validateReminder,
  'dueDate',
  true,
  'dueDate',
)
