import type { Medication } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { validateMedication } from './validators'

export const medicationRepository = new BaseRepository<Medication>(
  appDatabase.medications,
  'medications',
  validateMedication,
  'startDate',
  true,
  'startDate',
)
