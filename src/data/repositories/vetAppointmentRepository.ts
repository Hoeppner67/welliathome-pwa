import type { VetAppointment } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { validateVetAppointment } from './validators'

export const vetAppointmentRepository = new BaseRepository<VetAppointment>(
  appDatabase.vetAppointments,
  'vetAppointments',
  validateVetAppointment,
  'date',
  true,
  'date',
)
