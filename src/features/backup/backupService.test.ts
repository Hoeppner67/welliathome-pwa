import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { appDatabase, initializeDatabase } from '../../data/database/appDatabase'
import {
  birdRepository,
  favoriteRepository,
  feedMixRepository,
  healthEventRepository,
  mediaRepository,
  medicationRepository,
  observationRepository,
  reminderRepository,
  vetAppointmentRepository,
  weightRepository,
} from '../../data/repositories'
import {
  backupFilename,
  createBackupExport,
  createBackupJson,
  getBackupStatus,
  MAX_BACKUP_FILE_BYTES,
  MAX_BACKUP_IMAGE_BYTES,
  parseBackupJson,
  recordBackup,
  restoreBackup,
  validateBackupFileSize,
} from './backupService'
import { initializeFeedRecommendations } from '../feed-mixes/services/feedRecommendations'

const timestamp = '2026-11-20T10:00:00.000Z'
const date = '2026-11-20'

async function seedAllTables() {
  const bird = await birdRepository.create({
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: timestamp,
  })
  const blob = new Blob(['bird image bytes'], { type: 'image/webp' })
  const asset = await mediaRepository.create({
    fileName: 'pico.webp',
    mimeType: 'image/webp',
    fileSize: blob.size,
    blob,
    relatedType: 'bird-profile',
    relatedId: bird.id,
    createdAt: timestamp,
  })
  await birdRepository.update(bird.id, { imageId: asset.id })
  await medicationRepository.create({
    birdId: bird.id,
    name: 'Augentropfen',
    startDate: date,
    createdAt: timestamp,
  })
  await weightRepository.create({ birdId: bird.id, weight: 36.5, date, createdAt: timestamp })
  await observationRepository.create({
    birdId: bird.id,
    description: 'Frisst gut',
    date,
    createdAt: timestamp,
  })
  await healthEventRepository.create({
    birdId: bird.id,
    title: 'Niesen',
    description: 'Einmal beobachtet',
    date,
    createdAt: timestamp,
  })
  await vetAppointmentRepository.create({
    birdId: bird.id,
    title: 'Kontrolle',
    date,
    createdAt: timestamp,
  })
  await reminderRepository.create({
    birdId: bird.id,
    title: 'Käfig reinigen',
    dueDate: date,
    completed: false,
    reminderType: 'care',
    createdAt: timestamp,
  })
  const mix = await feedMixRepository.create({
    name: 'Hirse-Mix',
    ingredients: ['Silberhirse', 'Japanhirse'],
    createdAt: timestamp,
  })
  await favoriteRepository.create({
    itemType: 'feed-mix',
    itemId: mix.id,
    title: mix.name,
    createdAt: timestamp,
  })
  return { bird, asset, mix }
}

async function makeBackupObject(): Promise<Record<string, any>> {
  return JSON.parse(await createBackupJson()) as Record<string, any>
}

describe('Welli@Home-Backup', () => {
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })

  afterAll(async () => {
    await appDatabase.delete()
  })

  it('exportiert alle Tabellen, Metadaten und Profilbilddaten', async () => {
    await seedAllTables()
    const json = await createBackupJson()
    const backup = JSON.parse(json)
    expect(backup.format).toBe('welliathome-backup')
    expect(backup.formatVersion).toBe(2)
    expect(backup.initialization.feedRecommendationsSeeded).toBe(false)
    expect(new Date(backup.createdAt).toISOString()).toBe(backup.createdAt)
    expect(Object.keys(backup.data).sort()).toEqual([
      'birds',
      'favorites',
      'feedMixes',
      'healthEvents',
      'mediaAssets',
      'medications',
      'observations',
      'reminders',
      'vetAppointments',
      'weights',
    ])
    expect(backup.data.mediaAssets[0].blob.base64).toBeTruthy()
    expect(backup.data.mediaAssets[0].blob.type).toBe('image/webp')
    expect(backupFilename(new Date(2026, 10, 20))).toBe('welliathome-backup-2026-11-20.json')

    const parsed = await parseBackupJson(json)
    expect(parsed.summary).toEqual({ birds: 1, documentation: 6, feedMixes: 1 })
    expect(await parsed.data.mediaAssets[0].blob.text()).toBe('bird image bytes')
  })

  it('stellt alle Daten samt IDs, Zeitstempeln, Relationen und Bild erneut her', async () => {
    const source = await seedAllTables()
    const backupJson = await createBackupJson()
    await appDatabase.transaction('rw', appDatabase.tables, async () => {
      for (const table of appDatabase.tables) await table.clear()
    })
    await birdRepository.create({ name: 'Anderer Vogel', species: 'Wellensittich' })

    const parsed = await parseBackupJson(backupJson)
    await restoreBackup(parsed)
    const restoredBird = await birdRepository.getById(source.bird.id)
    expect(restoredBird?.imageId).toBe(source.asset.id)
    expect(restoredBird?.createdAt).toBe(timestamp)
    expect(await birdRepository.list()).toHaveLength(1)
    expect((await medicationRepository.listByBirdId(source.bird.id))[0].id).toBeTruthy()
    expect((await feedMixRepository.getById(source.mix.id))?.name).toBe('Hirse-Mix')
    expect((await mediaRepository.getById(source.asset.id))?.blob.size).toBe(source.asset.blob.size)

    const roundTrip = await parseBackupJson(await createBackupJson())
    expect(roundTrip.data.birds).toEqual(parsed.data.birds)
    expect(roundTrip.data.mediaAssets[0].id).toBe(source.asset.id)
    expect(roundTrip.data.mediaAssets[0].blob.size).toBe(source.asset.blob.size)
  })

  it('weist ungültiges JSON, falsches Format, unbekannte Version und ungültige Pflichtfelder zurück', async () => {
    await seedAllTables()
    await expect(parseBackupJson('{oops')).rejects.toThrow('kein gültiges JSON')
    const base = await makeBackupObject()

    await expect(
      parseBackupJson(JSON.stringify({ ...base, format: 'other-backup' })),
    ).rejects.toThrow('kein Welli@Home-Backup')
    await expect(parseBackupJson(JSON.stringify({ ...base, formatVersion: 99 }))).rejects.toThrow(
      'wird nicht unterstützt',
    )
    const invalidRequired = structuredClone(base)
    invalidRequired.data.birds[0].name = '  '
    await expect(parseBackupJson(JSON.stringify(invalidRequired))).rejects.toThrow()
  })

  it('exportiert trotz einzelner ungültiger Altdaten und meldet deren Anzahl', async () => {
    await appDatabase.birds.put({
      id: 'legacy-invalid',
      name: '',
      species: 'Wellensittich',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const backup = await createBackupExport()
    expect(backup.invalidRecords).toBe(1)
    expect(JSON.parse(backup.json).data.birds[0].name).toBe('')
  })

  it('meldet unzulässige Bestandsbilder im Export, ohne sie zu verwerfen', async () => {
    await seedAllTables()
    const [asset] = await appDatabase.mediaAssets.toArray()
    if (!asset) throw new Error('Profilbild fehlt')
    await appDatabase.mediaAssets.update(asset.id, { mimeType: 'image/gif' })

    const backup = await createBackupExport()
    expect(backup.invalidRecords).toBe(1)
    expect(JSON.parse(backup.json).data.mediaAssets[0].mimeType).toBe('image/gif')
  })

  it('weist zu große Backups und Profilbilder bereits vor dem Decodieren zurück', async () => {
    expect(() => validateBackupFileSize(MAX_BACKUP_FILE_BYTES + 1)).toThrow('50 MB')
    await seedAllTables()
    const backup = await makeBackupObject()
    backup.data.mediaAssets[0].mimeType = 'image/gif'
    backup.data.mediaAssets[0].blob.type = 'image/gif'
    await expect(parseBackupJson(JSON.stringify(backup))).rejects.toThrow(
      'keinen unterstützten Bildtyp',
    )
    backup.data.mediaAssets[0].mimeType = 'image/webp'
    backup.data.mediaAssets[0].blob.type = 'image/webp'
    backup.data.mediaAssets[0].fileSize = MAX_BACKUP_IMAGE_BYTES + 1
    backup.data.mediaAssets[0].blob.base64 = 'A'.repeat(
      Math.ceil(MAX_BACKUP_IMAGE_BYTES / 3) * 4 + 4,
    )
    await expect(parseBackupJson(JSON.stringify(backup))).rejects.toThrow('Limit von 2 MB')
  })

  it('verhindert Wiederherstellung bei fehlerhaften Vogelbeziehungen', async () => {
    await seedAllTables()
    const invalidRelation = await makeBackupObject()
    invalidRelation.data.weights[0].birdId = 'missing-bird'
    await expect(parseBackupJson(JSON.stringify(invalidRelation))).rejects.toThrow(
      'nicht vorhandenes Vogelprofil',
    )
  })

  it('lässt bisherige Daten nach einem Transaktionsfehler vollständig bestehen', async () => {
    const original = await birdRepository.create({
      name: 'Bleibt erhalten',
      species: 'Wellensittich',
    })
    const backupBird = {
      id: 'restore-bird',
      name: 'Backup-Vogel',
      species: 'Wellensittich',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const backup = await parseBackupJson(
      JSON.stringify({
        format: 'welliathome-backup',
        formatVersion: 1,
        createdAt: timestamp,
        data: {
          birds: [backupBird],
          medications: [],
          weights: [],
          observations: [],
          healthEvents: [],
          vetAppointments: [],
          reminders: [],
          feedMixes: [],
          favorites: [],
          mediaAssets: [],
        },
      }),
    )
    const failingWrite = vi
      .spyOn(appDatabase.feedMixes, 'bulkAdd')
      .mockRejectedValue(new Error('simulierter Fehler'))

    await expect(restoreBackup(backup)).rejects.toThrow('bisherigen Daten wurden beibehalten')
    failingWrite.mockRestore()
    expect(await birdRepository.getById(original.id)).toBeTruthy()
    expect(await birdRepository.getById('restore-bird')).toBeUndefined()
  })

  it('verändert bei nicht bestätigter Wiederherstellung keine Daten', async () => {
    const original = await birdRepository.create({
      name: 'Bleibt erhalten',
      species: 'Wellensittich',
    })
    const candidate = await birdRepository.create({ name: 'Vorschau', species: 'Wellensittich' })
    const json = await createBackupJson()
    const parsed = await parseBackupJson(json)
    expect(parsed.data.birds.map((bird) => bird.id)).toContain(candidate.id)
    // Parsing prepares the preview only; without calling restoreBackup no table is changed.
    expect(await birdRepository.getById(original.id)).toBeTruthy()
    expect(await birdRepository.getById(candidate.id)).toBeTruthy()
  })

  it('erhält den Empfehlungs-Initialisierungsmarker im Backup und verhindert ein erneutes Seed nach Restore', async () => {
    const { initializeFeedRecommendations } =
      await import('../feed-mixes/services/feedRecommendations')
    await initializeFeedRecommendations()
    const primus = (await feedMixRepository.list()).find((mix) => mix.name === 'Primus Basis')
    if (!primus) throw new Error('Primus Basis fehlt')
    await feedMixRepository.delete(primus.id)

    const json = await createBackupJson()
    const serialized = JSON.parse(json)
    expect(serialized.initialization.feedRecommendationsSeeded).toBe(true)
    const parsed = await parseBackupJson(json)
    await restoreBackup(parsed)
    await initializeFeedRecommendations()

    const mixes = await feedMixRepository.list()
    expect(mixes).toHaveLength(3)
    expect(mixes.some((mix) => mix.name === 'Primus Basis')).toBe(false)
  })

  it('erhält redaktionelle Offline-Inhalte bei persönlicher Backup-Wiederherstellung', async () => {
    const syncedAt = timestamp
    await appDatabase.wikiArticles.add({
      id: 'wiki-77',
      wpId: 77,
      slug: 'gras',
      title: 'Gras',
      permalink: 'https://welliathome.de/wiki/gras/',
      contentHtml: '<p>Text</p>',
      excerptHtml: '',
      categoryIds: [],
      createdAt: syncedAt,
      updatedAt: syncedAt,
    })
    const parsed = await parseBackupJson(await createBackupJson())
    await birdRepository.create({ name: 'Zwischenstand', species: 'Wellensittich' })
    await restoreBackup(parsed)
    expect(await appDatabase.wikiArticles.get('wiki-77')).toBeTruthy()
    expect(await birdRepository.list()).toHaveLength(0)
  })
  it('liest beide Formate und zählt verworfene Felder einschließlich Bilddaten', async () => {
    await seedAllTables()
    const compact = await createBackupJson()
    expect(compact).not.toContain('\n')
    expect(await createBackupJson({ pretty: true })).toContain('\n')
    const original = await makeBackupObject()
    original.data.birds[0].futureProperty = true
    original.data.mediaAssets[0].blob.futureProperty = true
    for (const formatVersion of [1, 2]) {
      const parsed = await parseBackupJson(JSON.stringify({ ...original, formatVersion }))
      expect(parsed.ignoredFields).toBe(2)
      expect(parsed.data.birds[0]).not.toHaveProperty('futureProperty')
      await restoreBackup(parsed)
      expect((await birdRepository.list())[0]).not.toHaveProperty('futureProperty')
    }
  })

  it('warnt mit persönlichen Daten nach 30 Tagen und erhält das Datum bei Wiederherstellung', async () => {
    const date = new Date(timestamp)
    expect((await getBackupStatus(date.getTime())).needsBackup).toBe(false)
    await birdRepository.create({ name: 'Pico', species: 'Wellensittich' })
    expect((await getBackupStatus(date.getTime())).needsBackup).toBe(true)
    await recordBackup(date)
    expect(await getBackupStatus(date.getTime() + 30 * 86400000)).toEqual({
      lastBackup: timestamp,
      needsBackup: false,
    })
    await restoreBackup(await parseBackupJson(await createBackupJson()))
    expect(await getBackupStatus(date.getTime() + 31 * 86400000)).toEqual({
      lastBackup: timestamp,
      needsBackup: true,
    })
  })

  it('empfiehlt kein Backup nur wegen unveränderter Futterempfehlungen', async () => {
    await initializeFeedRecommendations()
    expect((await getBackupStatus()).needsBackup).toBe(false)

    const [recommendation] = await feedMixRepository.list()
    await feedMixRepository.update(recommendation.id, { notes: 'Eigene Anpassung' })
    expect((await getBackupStatus()).needsBackup).toBe(true)
  })
  it('protokolliert eine Wiederherstellung atomar bei aktiviertem Geräteabgleich', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    try {
      await birdRepository.create({ id: 'saved', name: 'Pico', species: 'Wellensittich' })
      const backup = await parseBackupJson(await createBackupJson())
      await birdRepository.create({ id: 'later', name: 'Luna', species: 'Wellensittich' })
      values.set('welliathome-device-sync-enabled', 'true')
      await restoreBackup(backup)
      const ops = await appDatabase.deviceOperations.orderBy('sequence').toArray()
      expect(ops.map((op) => `${op.recordId}:${op.action}`)).toEqual([
        'later:delete',
        'saved:delete',
        'saved:put',
      ])
      expect((await appDatabase.birds.toArray()).map((bird) => bird.id)).toEqual(['saved'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rollt Daten und Journal bei einem Fehler während der Wiederherstellung gemeinsam zurück', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    try {
      await birdRepository.create({ id: 'saved', name: 'Pico', species: 'Wellensittich' })
      const backup = await parseBackupJson(await createBackupJson())
      await birdRepository.create({ id: 'later', name: 'Luna', species: 'Wellensittich' })
      values.set('welliathome-device-sync-enabled', 'true')
      const before = await appDatabase.birds.toArray()
      const add = vi
        .spyOn(appDatabase.deviceOperations, 'add')
        .mockRejectedValueOnce(new Error('Journal nicht verfügbar'))
      try {
        await expect(restoreBackup(backup)).rejects.toThrow(
          'Die Wiederherstellung ist fehlgeschlagen',
        )
        expect(await appDatabase.birds.toArray()).toEqual(before)
        expect(await appDatabase.deviceOperations.count()).toBe(0)
      } finally {
        add.mockRestore()
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
