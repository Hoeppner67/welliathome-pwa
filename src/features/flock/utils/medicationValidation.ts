import { isIsoDate } from '../../../utils/date'

export interface MedicationFormValues {
  name: string
  dosage: string
  startDate: string
  endDate: string
  notes: string
}
export type MedicationFormErrors = Partial<Record<keyof MedicationFormValues, string>>

export function validateMedicationForm(values: MedicationFormValues): MedicationFormErrors {
  const errors: MedicationFormErrors = {}
  if (!values.name.trim()) errors.name = 'Bitte gib den Medikamentennamen ein.'
  else if (values.name.length > 120) errors.name = 'Bitte höchstens 120 Zeichen eingeben.'
  if (!isIsoDate(values.startDate)) errors.startDate = 'Bitte wähle ein gültiges Startdatum.'
  if (values.endDate && !isIsoDate(values.endDate))
    errors.endDate = 'Bitte wähle ein gültiges Enddatum.'
  if (
    isIsoDate(values.startDate) &&
    isIsoDate(values.endDate) &&
    values.endDate < values.startDate
  ) {
    errors.endDate = 'Das Enddatum darf nicht vor dem Beginn liegen.'
  }
  if (values.dosage.length > 120) errors.dosage = 'Bitte höchstens 120 Zeichen eingeben.'
  if (values.notes.length > 2000) errors.notes = 'Bitte höchstens 2000 Zeichen eingeben.'
  return errors
}
