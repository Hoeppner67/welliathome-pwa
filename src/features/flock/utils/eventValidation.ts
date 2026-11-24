import { isIsoDate } from '../../../utils/date'
import type { EventKind } from '../services/eventService'

export interface EventFormValues {
  kind: EventKind
  date: string
  title: string
  description: string
  diagnosis: string
  notes: string
}

export type EventFormErrors = Partial<Record<keyof EventFormValues, string>>

export function validateEventForm(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {}
  if (!isIsoDate(values.date)) errors.date = 'Bitte gib ein gültiges Datum ein.'
  if (values.kind === 'observation') {
    if (!values.description.trim()) errors.description = 'Bitte beschreibe deine Beobachtung.'
  } else {
    if (!values.title.trim())
      errors.title =
        values.kind === 'problem' ? 'Bitte gib das Problem an.' : 'Bitte gib den Anlass ein.'
    if (values.kind === 'problem' && !values.description.trim())
      errors.description = 'Bitte beschreibe das Problem.'
  }
  if (values.title.length > 120)
    errors.title = 'Die Überschrift darf höchstens 120 Zeichen enthalten.'
  if (values.description.length > 4000)
    errors.description = 'Die Beschreibung darf höchstens 4000 Zeichen enthalten.'
  if (values.diagnosis.length > 2000)
    errors.diagnosis = 'Die Diagnose darf höchstens 2000 Zeichen enthalten.'
  if (values.notes.length > 2000)
    errors.notes = 'Die Notizen dürfen höchstens 2000 Zeichen enthalten.'
  return errors
}
