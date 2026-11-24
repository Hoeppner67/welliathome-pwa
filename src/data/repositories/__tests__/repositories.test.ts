import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { appDatabase, initializeDatabase } from '../../database/appDatabase'
import { vi } from 'vitest'
import {
  birdRepository,
  favoriteRepository,
  feedMixRepository,
  medicationRepository,
  observationRepository,
  weightRepository,
} from '../index'
import { toggleFavorite } from '../../../features/content/favoriteService'
import { InvalidRecordError } from '../repositoryErrors'

const bird = () => ({
  name: 'Pico',
  species: 'Wellensittich',
})

describe('lokale Dexie-Datenbank und Repositorys', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })

  afterAll(async () => {
    await appDatabase.delete()
  })

  it('initialisiert alle Tabellen', async () => {
    expect(appDatabase.isOpen()).toBe(true)
    expect(appDatabase.tables.map((table) => table.name)).toEqual([
      'birds',
      'medications',
      'weights',
      'observations',
      'healthEvents',
      'vetAppointments',
      'reminders',
      'feedMixes',
      'favorites',
      'mediaAssets',
      'wikiArticles',
      'wikiCategories',
      'plants',
      'contentSyncStatus',
      'appMetadata',
      'devicePendingPackages',
      'deviceOperations',
      'deviceReconciliation',
    ])
  })

  it('erstellt und ruft ein Vogelprofil ab', async () => {
    const created = await birdRepository.create(bird())

    await expect(birdRepository.getById(created.id)).resolves.toMatchObject({
      id: created.id,
      name: 'Pico',
      species: 'Wellensittich',
    })
  })

  it('aktualisiert und löscht ein Vogelprofil', async () => {
    const created = await birdRepository.create(bird())
    const updated = await birdRepository.update(created.id, { name: 'Pico II' })

    expect(updated?.name).toBe('Pico II')
    expect(updated?.updatedAt).not.toBe(created.updatedAt)
    await expect(birdRepository.delete(created.id)).resolves.toBe(true)
    await expect(birdRepository.getById(created.id)).resolves.toBeUndefined()
  })

  it('erhält parallele Änderungen an unterschiedlichen Feldern', async () => {
    const created = await feedMixRepository.create({
      name: 'Ausgangsmischung',
      ingredients: ['Hirse'],
    })

    await Promise.all([
      feedMixRepository.update(created.id, { name: 'Neue Mischung' }),
      feedMixRepository.update(created.id, { notes: 'Eigene Notiz' }),
    ])

    await expect(feedMixRepository.getById(created.id)).resolves.toMatchObject({
      name: 'Neue Mischung',
      notes: 'Eigene Notiz',
    })
  })

  it('erstellt Gewichtseinträge, filtert nach Vogel und sortiert nach Datum', async () => {
    const created = await birdRepository.create(bird())
    await weightRepository.create({ birdId: created.id, weight: 41, date: '2026-05-02' })
    await weightRepository.create({ birdId: created.id, weight: 40, date: '2026-04-28' })
    const another = await birdRepository.create({ ...bird(), name: 'Luna' })
    await weightRepository.create({ birdId: another.id, weight: 39, date: '2026-04-29' })

    const weights = await weightRepository.listByBirdId(created.id)
    expect(weights.map((entry) => entry.date)).toEqual(['2026-04-28', '2026-05-02'])
    await expect(
      weightRepository.listByDateRange('2026-04-29', '2026-05-31'),
    ).resolves.toHaveLength(2)
  })

  it('erstellt ein Medikament', async () => {
    const profile = await birdRepository.create({ ...bird(), id: 'bird-1' })
    const created = await medicationRepository.create({
      birdId: profile.id,
      name: 'Beispielmedikament',
      startDate: '2026-05-01',
      endDate: '2026-05-07',
    })

    expect(await medicationRepository.getById(created.id)).toMatchObject({
      name: 'Beispielmedikament',
      birdId: 'bird-1',
    })
  })

  it('weist verwaiste Vogelbezüge bei Erstellung und Änderung zurück', async () => {
    const profile = await birdRepository.create(bird())
    const entry = await weightRepository.create({
      birdId: profile.id,
      weight: 40,
      date: '2026-04-29',
    })
    await expect(
      weightRepository.create({ birdId: 'missing', weight: 39, date: '2026-04-29' }),
    ).rejects.toBeInstanceOf(InvalidRecordError)
    await expect(weightRepository.update(entry.id, { birdId: 'missing' })).rejects.toBeInstanceOf(
      InvalidRecordError,
    )
    expect((await weightRepository.getById(entry.id))?.birdId).toBe(profile.id)
    const general = await observationRepository.create({
      date: '2026-04-29',
      description: 'Allgemein',
    })
    expect((await observationRepository.getById(general.id))?.birdId).toBeUndefined()
  })

  it.each([false, true])(
    'hält Vogel und Dokumentation bei parallelem Löschen konsistent (Journal: %s)',
    async (journal) => {
      const storage = new Map<string, string>()
      if (journal) storage.set('welliathome-device-sync-enabled', 'true')
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      })
      try {
        const profile = await birdRepository.create(bird())
        await Promise.allSettled([
          birdRepository.delete(profile.id),
          weightRepository.create({ birdId: profile.id, weight: 40, date: '2026-04-29' }),
        ])
        const [saved, entries] = await Promise.all([
          birdRepository.getById(profile.id),
          weightRepository.listByBirdId(profile.id),
        ])
        expect(Boolean(saved) || entries.length === 0).toBe(true)
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )

  it('weist ein ungültiges Medikament mit Enddatum vor Startdatum zurück', async () => {
    await expect(
      medicationRepository.create({
        birdId: 'bird-1',
        name: 'Beispielmedikament',
        startDate: '2026-05-07',
        endDate: '2026-05-01',
      }),
    ).rejects.toBeInstanceOf(InvalidRecordError)
  })

  it('erstellt eine Körnermischung', async () => {
    const created = await feedMixRepository.create({
      name: 'Frühlingsmischung',
      ingredients: ['Hirse', 'Kanariensaat'],
    })

    expect(await feedMixRepository.getById(created.id)).toMatchObject({
      name: 'Frühlingsmischung',
      ingredients: ['Hirse', 'Kanariensaat'],
    })
  })

  it('speichert und lädt Favoriten über den zusammengesetzten eindeutigen Index', async () => {
    const created = await favoriteRepository.create({
      itemType: 'plant',
      itemId: 'plant-42',
      title: 'Vogelmiere',
    })

    expect(await favoriteRepository.getById(created.id)).toMatchObject({
      itemType: 'plant',
      itemId: 'plant-42',
      title: 'Vogelmiere',
    })

    await expect(
      favoriteRepository.create({
        itemType: 'plant',
        itemId: 'plant-42',
      }),
    ).rejects.toMatchObject({
      name: 'RepositoryError',
      operation: 'create',
      tableName: 'favorites',
    })
  })
  it('behandelt paralleles Hinzufügen und entfernt über den zusammengesetzten Index', async () => {
    await Promise.all([
      toggleFavorite('plant', '42', 'Vogelmiere', false),
      toggleFavorite('plant', '42', 'Vogelmiere', false),
      toggleFavorite('wiki-article', '42', 'Vogelmiere', false),
    ])
    expect(await favoriteRepository.list()).toHaveLength(2)
    await toggleFavorite('plant', '42', 'Vogelmiere', true)
    expect((await favoriteRepository.list()).map((item) => item.itemType)).toEqual(['wiki-article'])
  })
})
