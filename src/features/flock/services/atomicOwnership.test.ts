import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appDatabase } from '../../../data/database/appDatabase'
import { birdRepository, observationRepository, weightRepository } from '../../../data/repositories'
import { documentationService } from './documentationService'
import { eventService } from './eventService'

beforeEach(async () => {
  await appDatabase.delete()
  await appDatabase.open()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(async () => {
  await appDatabase.delete()
})

it.each([false, true])(
  'rollt begonnene Dokumentations- und Ereignisänderungen zurück (Journal: %s)',
  async (journal) => {
    const storage = new Map<string, string>()
    if (journal) storage.set('welliathome-device-sync-enabled', 'true')
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    const bird = await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })
    const weight = await weightRepository.create({
      birdId: bird.id,
      date: '2026-05-01',
      weight: 40,
    })
    const observation = await observationRepository.create({
      birdId: bird.id,
      date: '2026-05-01',
      description: 'Alt',
    })
    const count = await appDatabase.deviceOperations.count()

    const updateWeight = weightRepository.update.bind(weightRepository)
    vi.spyOn(weightRepository, 'update').mockImplementation(async (...args) => {
      await updateWeight(...args)
      throw new Error('Abbruch nach Änderung')
    })
    await expect(
      documentationService.updateWeight(bird.id, weight.id, { date: weight.date, weight: 42 }),
    ).rejects.toThrow('Abbruch nach Änderung')
    expect((await weightRepository.getById(weight.id))?.weight).toBe(40)
    expect(await appDatabase.deviceOperations.count()).toBe(count)

    const deleteObservation = observationRepository.delete.bind(observationRepository)
    vi.spyOn(observationRepository, 'delete').mockImplementation(async (...args) => {
      await deleteObservation(...args)
      throw new Error('Abbruch nach Löschung')
    })
    await expect(
      eventService.delete(bird.id, { kind: 'observation', record: observation }),
    ).rejects.toThrow('Abbruch nach Löschung')
    expect((await observationRepository.getById(observation.id))?.description).toBe('Alt')
    expect(await appDatabase.deviceOperations.count()).toBe(count)
  },
)

it.each([false, true])(
  'serialisiert einen konkurrierenden Vogelwechsel mit einer Dokumentationsänderung (Journal: %s)',
  async (journal) => {
    const storage = new Map<string, string>()
    if (journal) storage.set('welliathome-device-sync-enabled', 'true')
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    const first = await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })
    const second = await birdRepository.create({ name: 'Luna', species: 'Wellensittich' })
    const weight = await weightRepository.create({
      birdId: first.id,
      date: '2026-05-01',
      weight: 40,
    })
    const getById = weightRepository.getById.bind(weightRepository)
    let competing!: Promise<unknown>
    vi.spyOn(weightRepository, 'getById').mockImplementationOnce(async (id) => {
      const result = await getById(id)
      competing = Dexie.ignoreTransaction(() => weightRepository.update(id, { birdId: second.id }))
      return result
    })
    await documentationService.updateWeight(first.id, weight.id, { date: weight.date, weight: 42 })
    await competing
    expect(await getById(weight.id)).toMatchObject({ birdId: second.id, weight: 42 })
  },
)
