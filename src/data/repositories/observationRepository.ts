import type { Observation } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { validateObservation } from './validators'

export const observationRepository = new BaseRepository<Observation>(
  appDatabase.observations,
  'observations',
  validateObservation,
  'date',
  true,
  'date',
)
