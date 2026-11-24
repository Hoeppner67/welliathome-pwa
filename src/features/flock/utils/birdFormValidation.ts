import type { BirdProfile } from '../../../models'
import { isBirdDate } from '../../../utils/date'

export type BirdFormField =
  'name' | 'gender' | 'hatchDate' | 'arrivalDate' | 'color' | 'ringNumber' | 'origin' | 'notes'
export type BirdFormValues = Record<BirdFormField, string>
export type BirdFormErrors = Partial<Record<BirdFormField, string>>

export const emptyBirdForm: BirdFormValues = {
  name: '',
  gender: '',
  hatchDate: '',
  arrivalDate: '',
  color: '',
  ringNumber: '',
  origin: '',
  notes: '',
}

const limits: Record<BirdFormField, number> = {
  name: 80,
  gender: 16,
  hatchDate: 32,
  arrivalDate: 32,
  color: 80,
  ringNumber: 50,
  origin: 120,
  notes: 2000,
}

export function birdToFormValues(bird?: BirdProfile): BirdFormValues {
  if (!bird) return { ...emptyBirdForm }
  return {
    name: bird.name,
    gender: bird.gender ?? '',
    hatchDate: bird.hatchDate ?? '',
    arrivalDate: bird.arrivalDate ?? '',
    color: bird.color ?? '',
    ringNumber: bird.ringNumber ?? '',
    origin: bird.origin ?? '',
    notes: bird.notes ?? '',
  }
}

export function validateBirdForm(values: BirdFormValues): BirdFormErrors {
  const errors: BirdFormErrors = {}
  if (!values.name.trim()) errors.name = 'Bitte gib einen Namen ein.'
  for (const field of Object.keys(limits) as BirdFormField[]) {
    if (values[field].length > limits[field])
      errors[field] = `Bitte höchstens ${limits[field]} Zeichen eingeben.`
  }
  for (const field of ['hatchDate', 'arrivalDate'] as const) {
    if (values[field].trim() && !isBirdDate(values[field])) {
      errors[field] = 'Bitte gib ein gültiges Datum, Monat und Jahr oder ein Jahr ein.'
    }
  }
  return errors
}

export function valuesToBirdInput(values: BirdFormValues) {
  return {
    name: values.name.trim(),
    species: 'Wellensittich',
    ...(values.gender && { gender: values.gender }),
    hatchDate: values.hatchDate.trim() ? values.hatchDate : undefined,
    arrivalDate: values.arrivalDate.trim() ? values.arrivalDate : undefined,
    ...(values.color.trim() && { color: values.color.trim() }),
    ...(values.ringNumber.trim() && { ringNumber: values.ringNumber.trim() }),
    ...(values.origin.trim() && { origin: values.origin.trim() }),
    ...(values.notes.trim() && { notes: values.notes.trim() }),
  }
}
