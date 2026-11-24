import type { WeightEntry } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { validateWeightEntry } from './validators'

export const weightRepository = new BaseRepository<WeightEntry>(
  appDatabase.weights,
  'weights',
  validateWeightEntry,
  'date',
  true,
  'date',
)
