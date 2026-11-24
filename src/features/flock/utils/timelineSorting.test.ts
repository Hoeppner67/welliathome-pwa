import { describe, expect, it } from 'vitest'
import { buildTimeline, filterTimeline } from '../services/timelineService'
import { sortTimeline } from './timelineSorting'
import type { HealthEvent, Medication, Observation, VetAppointment } from '../../../models'

const entity = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
const observation = (id: string, date: string): Observation => ({
  ...entity,
  id,
  birdId: 'bird-a',
  date,
  title: id,
  description: 'Text',
})
const problem = (id: string, date: string): HealthEvent => ({
  ...entity,
  id,
  birdId: 'bird-a',
  date,
  title: id,
  description: 'Problem',
})
const vet = (id: string, date: string): VetAppointment => ({
  ...entity,
  id,
  birdId: 'bird-a',
  date,
  title: id,
})
const medication = (id: string, startDate: string, endDate?: string): Medication => ({
  ...entity,
  id,
  birdId: 'bird-a',
  name: id,
  startDate,
  ...(endDate && { endDate }),
})

describe('Chronik', () => {
  it('führt Beobachtungen, Probleme, Tierarzttermine und Medikamentenzeitpunkte zusammen', () => {
    const items = buildTimeline(
      [observation('o', '2026-05-01')],
      [problem('h', '2026-05-02')],
      [vet('v', '2026-05-03')],
      [medication('m', '2026-05-04', '2026-05-05')],
    )
    expect(items.map((item) => item.key)).toEqual([
      'medication:m:end',
      'medication:m:start',
      'vet:v',
      'problem:h',
      'observation:o',
    ])
  })

  it('behält mehrere Einträge desselben Tages und eindeutige Medikamentenschlüssel', () => {
    const items = buildTimeline(
      [observation('a', '2026-05-01'), observation('b', '2026-05-01')],
      [],
      [],
      [medication('m', '2026-05-01', '2026-05-01')],
    )
    expect(items).toHaveLength(4)
    expect(new Set(items.map((item) => item.key)).size).toBe(4)
  })

  it('markiert zukünftige Einträge und erstellt keine Medikamente in der Datenbank', () => {
    const futureMedication = medication('m', '2999-01-01')
    const futureVet = vet('v', '2999-01-01')
    const items = buildTimeline([], [], [futureVet], [futureMedication])
    expect(items.every((item) => item.isFuture)).toBe(true)
  })

  it('sortiert stabil und filtert Chronikeinträge ausschließlich für die Darstellung', () => {
    const items = buildTimeline(
      [observation('a', '2026-05-01'), observation('b', '2026-05-01')],
      [problem('p', '2026-05-01')],
      [],
      [],
    )
    expect(sortTimeline(items).map((item) => item.key)).toEqual(items.map((item) => item.key))
    expect(filterTimeline(items, 'observation')).toHaveLength(2)
    expect(filterTimeline(items, 'problem')).toHaveLength(1)
    expect(filterTimeline(items, 'all')).toHaveLength(3)
    expect(filterTimeline([], 'all')).toHaveLength(0)
  })

  it('zeigt optionale Diagnose und alte Anlässe ohne Datenmigration', () => {
    const appointment = { ...vet('v', '2026-05-01'), diagnosis: 'Konjunktivitis' }
    const oldAppointment = { ...vet('old', '2026-05-01'), reason: 'Kontrolle' }
    const items = buildTimeline([], [], [appointment, oldAppointment], [])
    expect(items.find((item) => item.sourceId === 'v')?.description).toBe(
      'Diagnose: Konjunktivitis',
    )
    expect(items.find((item) => item.sourceId === 'old')?.description).toBe('Anlass: Kontrolle')
  })
})
