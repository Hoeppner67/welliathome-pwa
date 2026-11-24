import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { appDatabase, initializeDatabase } from '../../database/appDatabase'
import {
  birdRepository,
  medicationRepository,
  weightRepository,
  InvalidRecordError,
} from '../index'
import {
  DocumentationEntryNotFoundError,
  documentationService,
} from '../../../features/flock/services/documentationService'
import { groupMedications } from '../../../features/flock/utils/medicationStatus'
import { parseWeight, validateWeightForm } from '../../../features/flock/utils/weightValidation'
import { localIsoDate } from '../../../utils/date'
import { validateMedicationForm } from '../../../features/flock/utils/medicationValidation'
import { sortWeightEntries } from '../../../features/flock/utils/weightSorting'
import type { Medication } from '../../../models'

const createBird = (name: string) => birdRepository.create({ name, species: 'Wellensittich' })
const medication = (birdId: string, name = 'Augentropfen') =>
  medicationRepository.create({ birdId, name, startDate: '2026-05-01' })

describe('Phase 6 – Gewichte und Medikamente', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  it('interpretiert deutsche Dezimalkommas und validiert positive Gewichte', () => {
    expect(parseWeight('36,5')).toBe(36.5)
    expect(parseWeight('40.2')).toBe(40.2)
    expect(parseWeight('40g')).toBe(40)
    expect(parseWeight('36,5 g')).toBe(36.5)
    expect(parseWeight('40 kg')).toBeUndefined()
    expect(parseWeight('g')).toBeUndefined()
    expect(parseWeight('1,2,3')).toBeUndefined()
    expect(parseWeight('Infinity')).toBeUndefined()
    expect(validateWeightForm({ date: '2026-05-10', weight: '0', notes: '' }).weight).toContain(
      'größer als null',
    )
    expect(validateWeightForm({ date: '2026-02-30', weight: '36,5', notes: '' }).date).toBeTruthy()
  })

  it('verwendet den lokalen Kalendertag statt UTC für neue Messungen', () => {
    expect(localIsoDate(new Date(2026, 4, 7, 23, 30))).toBe('2026-05-07')
  })

  it('erstellt, lädt, bearbeitet und löscht Gewichtseinträge mit stabiler Identität', async () => {
    const bird = await createBird('Pico')
    const created = await weightRepository.create({
      birdId: bird.id,
      date: '2026-05-10',
      weight: 36.5,
      notes: 'morgens',
    })
    expect(await weightRepository.getById(created.id)).toMatchObject({
      birdId: bird.id,
      weight: 36.5,
    })
    await new Promise((resolve) => setTimeout(resolve, 3))
    const updated = await weightRepository.update(created.id, { weight: 37 })
    expect(updated?.id).toBe(created.id)
    expect(updated?.createdAt).toBe(created.createdAt)
    expect(updated?.updatedAt).not.toBe(created.updatedAt)
    expect(await weightRepository.delete(created.id)).toBe(true)
    expect(await weightRepository.getById(created.id)).toBeUndefined()
    expect(await birdRepository.getById(bird.id)).toBeDefined()
  })

  it('lehnt ungültige Gewichtsdaten ab', async () => {
    const bird = await createBird('Pico')
    await expect(
      weightRepository.create({ birdId: bird.id, date: '2026-05-01', weight: Number.NaN }),
    ).rejects.toBeInstanceOf(InvalidRecordError)
    await expect(
      weightRepository.create({ birdId: bird.id, date: '2026-02-30', weight: 36 }),
    ).rejects.toBeInstanceOf(InvalidRecordError)
  })

  it('filtert nach Vogel und behält alle Messungen desselben Tages chronologisch', async () => {
    const firstBird = await createBird('Pico')
    const secondBird = await createBird('Luna')
    const first = await weightRepository.create({
      birdId: firstBird.id,
      date: '2026-05-10',
      weight: 36,
    })
    const sameDay = await weightRepository.create({
      birdId: firstBird.id,
      date: '2026-05-10',
      weight: 36.2,
    })
    await weightRepository.create({ birdId: firstBird.id, date: '2026-05-09', weight: 35.8 })
    await weightRepository.create({ birdId: secondBird.id, date: '2026-05-10', weight: 40 })
    const all = await weightRepository.listByBirdId(firstBird.id)
    expect(all).toHaveLength(3)
    expect(sortWeightEntries(all, 'asc').map((item) => item.date)).toEqual([
      '2026-05-09',
      '2026-05-10',
      '2026-05-10',
    ])
    expect(new Set(all.map((item) => item.id)).size).toBe(3)
    expect(all.map((item) => item.id)).toEqual(expect.arrayContaining([first.id, sameDay.id]))
    expect(await weightRepository.listByBirdId(secondBird.id)).toHaveLength(1)
    expect(await weightRepository.listByDateRange('2026-05-10', '2026-05-10')).toHaveLength(3)
  })

  it('behält gespeicherte Gewichte nach erneutem Öffnen der Datenbank', async () => {
    const bird = await createBird('Pico')
    const entry = await weightRepository.create({ birdId: bird.id, date: '2026-05-10', weight: 36 })
    appDatabase.close()
    await initializeDatabase()
    expect(await weightRepository.getById(entry.id)).toMatchObject({ birdId: bird.id, weight: 36 })
  })

  it('validiert Medikamentennamen und Behandlungszeiträume', () => {
    expect(
      validateMedicationForm({
        name: '  ',
        dosage: '',
        startDate: '2026-05-01',
        endDate: '',
        notes: '',
      }).name,
    ).toBeTruthy()
    expect(
      validateMedicationForm({
        name: 'Mittel',
        dosage: '',
        startDate: '2026-05-01',
        endDate: '2026-04-30',
        notes: '',
      }).endDate,
    ).toContain('nicht vor')
    expect(
      validateMedicationForm({
        name: 'Mittel',
        dosage: '',
        startDate: '2026-02-30',
        endDate: '',
        notes: '',
      }).startDate,
    ).toBeTruthy()
  })

  it('erstellt, lädt, bearbeitet und löscht Medikamente', async () => {
    const bird = await createBird('Pico')
    const created = await medication(bird.id)
    expect(await medicationRepository.getById(created.id)).toMatchObject({ name: 'Augentropfen' })
    await new Promise((resolve) => setTimeout(resolve, 3))
    const updated = await medicationRepository.update(created.id, {
      name: 'Salbe',
      dosage: '1 Tropfen',
    })
    expect(updated?.id).toBe(created.id)
    expect(updated?.createdAt).toBe(created.createdAt)
    expect(updated?.updatedAt).not.toBe(created.updatedAt)
    expect(await medicationRepository.delete(created.id)).toBe(true)
    expect(await medicationRepository.getById(created.id)).toBeUndefined()
  })

  it('lehnt Medikamente ohne Namen und ungültige Zeiträume ab', async () => {
    const bird = await createBird('Pico')
    await expect(
      medicationRepository.create({ birdId: bird.id, name: '  ', startDate: '2026-05-01' }),
    ).rejects.toBeInstanceOf(InvalidRecordError)
    await expect(
      medicationRepository.create({
        birdId: bird.id,
        name: 'Mittel',
        startDate: '2026-05-02',
        endDate: '2026-05-01',
      }),
    ).rejects.toBeInstanceOf(InvalidRecordError)
  })

  it('ordnet geplante, laufende und abgeschlossene Behandlungen anhand der Daten ein', () => {
    const make = (id: string, startDate: string, endDate?: string): Medication => ({
      id,
      birdId: 'bird',
      name: id,
      startDate,
      ...(endDate && { endDate }),
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    })
    const groups = groupMedications(
      [
        make('future', '2026-05-20'),
        make('active', '2026-05-01', '2026-05-15'),
        make('open', '2026-05-10'),
        make('done', '2026-04-01', '2026-05-14'),
      ],
      '2026-05-15',
    )
    expect(groups.planned.map((item) => item.id)).toEqual(['future'])
    expect(groups.active.map((item) => item.id)).toEqual(['open', 'active'])
    expect(groups.completed.map((item) => item.id)).toEqual(['done'])
  })

  it('verhindert Änderungen und Löschungen fremder Vogel-Einträge', async () => {
    const birdA = await createBird('Pico')
    const birdB = await createBird('Luna')
    const weight = await weightRepository.create({
      birdId: birdB.id,
      date: '2026-05-10',
      weight: 41,
    })
    const med = await medication(birdB.id)
    await expect(
      documentationService.updateWeight(birdA.id, weight.id, { date: '2026-05-10', weight: 1 }),
    ).rejects.toBeInstanceOf(DocumentationEntryNotFoundError)
    await expect(documentationService.deleteWeight(birdA.id, weight.id)).rejects.toBeInstanceOf(
      DocumentationEntryNotFoundError,
    )
    await expect(
      documentationService.updateMedication(birdA.id, med.id, {
        name: 'Changed',
        startDate: '2026-05-01',
      }),
    ).rejects.toBeInstanceOf(DocumentationEntryNotFoundError)
    await expect(documentationService.deleteMedication(birdA.id, med.id)).rejects.toBeInstanceOf(
      DocumentationEntryNotFoundError,
    )
    expect((await weightRepository.getById(weight.id))?.weight).toBe(41)
    expect((await medicationRepository.getById(med.id))?.name).toBe('Augentropfen')
    expect(await weightRepository.listByBirdId(birdA.id)).toHaveLength(0)
    expect(await medicationRepository.listByBirdId(birdA.id)).toHaveLength(0)
  })

  it('sortiert Gewichte nach Datum und Eintragszeit deterministisch', async () => {
    const bird = await createBird('Pico')
    await weightRepository.create({ birdId: bird.id, date: '2026-05-10', weight: 36 })
    await weightRepository.create({ birdId: bird.id, date: '2026-05-09', weight: 35 })
    const descending = await weightRepository.listByBirdId(bird.id, {
      sortBy: 'date',
      direction: 'desc',
    })
    expect(descending.map((item) => item.date)).toEqual(['2026-05-10', '2026-05-09'])
  })
})
