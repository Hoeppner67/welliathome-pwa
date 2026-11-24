import { isIsoDate } from '../../../utils/date'

export interface WeightFormValues {
  date: string
  weight: string
  notes: string
}
export type WeightFormErrors = Partial<Record<keyof WeightFormValues, string>>

export function parseWeight(value: string): number | undefined {
  const normalized = value.trim().replace(/\s/g, '').replace(/g$/i, '')
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(normalized)) return undefined
  const parsed = Number(normalized.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function validateWeightForm(values: WeightFormValues): WeightFormErrors {
  const errors: WeightFormErrors = {}
  if (!isIsoDate(values.date)) errors.date = 'Bitte wähle ein gültiges Datum.'
  const weight = parseWeight(values.weight)
  if (values.weight.trim() === '') errors.weight = 'Bitte gib das Gewicht ein.'
  else if (weight === undefined)
    errors.weight = 'Bitte gib eine gültige Zahl ein, zum Beispiel 36,5.'
  else if (weight <= 0) errors.weight = 'Das Gewicht muss größer als null sein.'
  if (values.notes.length > 2000) errors.notes = 'Bitte höchstens 2000 Zeichen eingeben.'
  return errors
}

export function formatIsoDate(value: string): string {
  if (!isIsoDate(value)) return value
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  )
}
