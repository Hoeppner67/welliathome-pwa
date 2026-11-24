import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import {
  healthEventRepository,
  observationRepository,
  vetAppointmentRepository,
} from '../../../data/repositories'
import { eventService, EventNotFoundError } from './eventService'
import { validateEventForm } from '../utils/eventValidation'
import { birdRepository } from '../../../data/repositories'

describe('Ereignisverwaltung', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  it('erstellt, lädt, bearbeitet und löscht Beobachtungen und erhält alte optionale Felder', async () => {
    const bird = await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })
    const created = await observationRepository.create({
      birdId: bird.id,
      date: '2026-05-01',
      title: 'Alt',
      description: 'Bisheriger Text',
      category: 'bestehend',
    })
    const event = (await eventService.listByBirdId(bird.id))[0]
    expect(event.kind).toBe('observation')
    await eventService.update(bird.id, event, {
      kind: 'observation',
      date: '2026-05-02',
      title: 'Neu',
      description: 'Aktualisiert',
    })
    const updated = await observationRepository.getById(created.id)
    expect(updated).toMatchObject({
      id: created.id,
      title: 'Neu',
      description: 'Aktualisiert',
      category: 'bestehend',
      birdId: bird.id,
    })
    expect(updated?.createdAt).toBe(created.createdAt)
    expect(updated?.updatedAt).not.toBe(created.updatedAt)
    await eventService.delete(bird.id, { kind: 'observation', record: updated! })
    expect(await observationRepository.getById(created.id)).toBeUndefined()
  })

  it('erstellt und bearbeitet Probleme ohne Schweregradfeld', async () => {
    const bird = await birdRepository.create({ name: 'Luna', species: 'Wellensittich' })
    const created = await eventService.create(bird.id, {
      kind: 'problem',
      date: '2026-05-01',
      title: 'Flügel geschont',
      description: 'Schonhaltung',
    })
    expect(created).toMatchObject({ birdId: bird.id })
    expect(created).not.toHaveProperty('severity')
    const event = (await eventService.listByBirdId(bird.id))[0]
    await eventService.update(bird.id, event, {
      kind: 'problem',
      date: '2026-05-02',
      title: 'Erholung',
      description: 'Wieder aktiv',
      notes: 'Notiz',
    })
    const updated = await healthEventRepository.getById(created.id)
    expect(updated).toMatchObject({ title: 'Erholung', notes: 'Notiz' })
    expect(updated).not.toHaveProperty('severity')
    const savedEvent = (await eventService.listByBirdId(bird.id))[0]
    await eventService.delete(bird.id, savedEvent)
    expect(await healthEventRepository.getById(created.id)).toBeUndefined()
  })

  it('speichert optionale Tierarztdiagnosen im vorhandenen Terminobjekt', async () => {
    const bird = await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })
    const created = await vetAppointmentRepository.create({
      birdId: bird.id,
      date: '2999-05-01',
      title: 'Kontrolle',
      reason: 'legacy',
      veterinarian: 'Praxis A',
    })
    const event = (await eventService.listByBirdId(bird.id))[0]
    await eventService.update(bird.id, event, {
      kind: 'vet',
      date: '2999-05-02',
      title: 'Kontrolle',
      diagnosis: 'Befund',
      notes: 'Rückfrage',
    })
    const saved = await vetAppointmentRepository.getById(created.id)
    expect(saved).toMatchObject({
      id: created.id,
      diagnosis: 'Befund',
      veterinarian: 'Praxis A',
      reason: 'legacy',
      date: '2999-05-02',
    })
    expect(saved?.createdAt).toBe(created.createdAt)
    const withoutDiagnosis = await eventService.create(bird.id, {
      kind: 'vet',
      date: '1999-01-01',
      title: 'Termin ohne Diagnose',
    })
    expect((await vetAppointmentRepository.getById(withoutDiagnosis.id))?.diagnosis).toBeUndefined()
    const eventToDelete = (await eventService.listByBirdId(bird.id)).find(
      (item) => item.record.id === created.id,
    )!
    await eventService.delete(bird.id, eventToDelete)
    expect(await vetAppointmentRepository.getById(created.id)).toBeUndefined()
  })

  it('verhindert Änderungen, Löschungen und Artwechsel bei fremden Vogelereignissen', async () => {
    const firstBird = await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })
    const secondBird = await birdRepository.create({ name: 'Luna', species: 'Wellensittich' })
    const created = await eventService.create(secondBird.id, {
      kind: 'problem',
      date: '2026-05-01',
      title: 'Problem',
      description: 'Text',
    })
    const event = (await eventService.listByBirdId(secondBird.id))[0]
    expect(await eventService.listByBirdId(firstBird.id)).toHaveLength(0)
    await expect(
      eventService.update(firstBird.id, event, {
        kind: 'problem',
        date: '2026-05-02',
        title: 'Fremd',
        description: 'Text',
      }),
    ).rejects.toBeInstanceOf(EventNotFoundError)
    await expect(eventService.delete(firstBird.id, event)).rejects.toBeInstanceOf(
      EventNotFoundError,
    )
    await expect(
      eventService.update(secondBird.id, event, {
        kind: 'vet',
        date: '2026-05-02',
        title: 'Artwechsel',
      }),
    ).rejects.toThrow('Ereignisart')
    expect((await healthEventRepository.getById(created.id))?.title).toBe('Problem')
  })

  it('validiert Pflichttexte und gültige Datumswerte je Ereignisart', () => {
    expect(
      validateEventForm({
        kind: 'observation',
        date: '2026-02-30',
        title: '',
        description: '  ',
        diagnosis: '',
        notes: '',
      }),
    ).toMatchObject({ date: expect.any(String), description: expect.any(String) })
    expect(
      validateEventForm({
        kind: 'problem',
        date: '2026-01-01',
        title: '  ',
        description: '',
        diagnosis: '',
        notes: '',
      }),
    ).toMatchObject({ title: expect.any(String), description: expect.any(String) })
    expect(
      validateEventForm({
        kind: 'vet',
        date: '2026-01-01',
        title: 'Kontrolle',
        description: '',
        diagnosis: '',
        notes: '',
      }),
    ).toEqual({})
  })
})
