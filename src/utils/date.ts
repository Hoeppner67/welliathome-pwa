import type { ISODate, ISOTimestamp } from '../models/base'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function nowIsoTimestamp(): ISOTimestamp {
  return new Date().toISOString()
}

export function nextIsoTimestamp(previous: ISOTimestamp): ISOTimestamp {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
}

export function localIsoDate(value = new Date()): ISODate {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toIsoDate(value: Date | string): ISODate {
  if (typeof value === 'string' && ISO_DATE_PATTERN.test(value)) {
    if (!isIsoDate(value)) {
      throw new RangeError('Ungültiges ISO-Datum: ' + value)
    }
    return value
  }

  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError('Das Datum ist ungültig.')
  }

  return localIsoDate(parsed)
}

export function formatGermanDate(value: string): string {
  if (!isIsoDate(value)) return value
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

export function isIsoDate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false
  const parsed = new Date(value + 'T00:00:00.000Z')
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Bird dates may have day, month or year precision. Two-digit years mean 2000–2099. */
export function isBirdDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 32) return false
  const text = value.trim()
  if (isIsoDate(text)) return true
  const full = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text)
  if (full) {
    const [, day, month, year] = full
    return (
      Number(year) > 0 && isIsoDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
    )
  }
  const numeric = /^(\d{1,2})\/(\d{2}|\d{4})$/.exec(text)
  if (numeric)
    return (
      Number(numeric[1]) >= 1 &&
      Number(numeric[1]) <= 12 &&
      (numeric[2].length === 2 || Number(numeric[2]) > 0)
    )
  if (/^\d{4}$/.test(text)) return Number(text) > 0
  const named =
    /^(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})$/i.exec(
      text,
    )
  return !!named && Number(named[2]) > 0
}

export function isIsoTimestamp(value: unknown): value is ISOTimestamp {
  if (typeof value !== 'string') return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}
