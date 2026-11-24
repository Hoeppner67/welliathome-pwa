import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatGermanDate, localIsoDate, toIsoDate } from './date'

const originalTimeZone = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'Europe/Berlin'
})

afterAll(() => {
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

describe('lokale Datumsfunktionen', () => {
  it('verwendet für 23:30 UTC den lokalen Folgetag statt des UTC-Tages', () => {
    const instant = new Date('2026-11-20T23:30:00.000Z')

    expect(localIsoDate(instant)).toBe('2026-11-21')
    expect(toIsoDate(instant)).toBe('2026-11-21')
    expect(formatGermanDate('2026-11-21')).toBe('21.11.2026')
  })

  it('behält gültige ISO-Daten und lehnt ungültige Kalendertage ab', () => {
    expect(toIsoDate('2026-11-21')).toBe('2026-11-21')
    expect(() => toIsoDate('2026-02-30')).toThrow('Ungültiges ISO-Datum')
  })
})
