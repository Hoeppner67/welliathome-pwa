import type { HealthEvent } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { validateHealthEvent } from './validators'

export const healthEventRepository = new BaseRepository<HealthEvent>(
  appDatabase.healthEvents,
  'healthEvents',
  validateHealthEvent,
  'date',
  true,
  'date',
)
