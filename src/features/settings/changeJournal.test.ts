import { afterAll, beforeEach, expect, it } from 'vitest'
import { AppDatabase, appDatabase } from '../../data/database/appDatabase'
import { commitJournaledChange, mutateJournaledRecord } from './changeJournal'

beforeEach(async () => {
  await appDatabase.delete()
  await appDatabase.open()
})
afterAll(async () => {
  await appDatabase.delete()
})

it('führt Datensätze, Journal und Sequenzzähler in drei Datenbanken getrennt', async () => {
  const devices = Array.from(
    { length: 3 },
    () => new AppDatabase(`test-device-${crypto.randomUUID()}`),
  )
  const stamp = '2026-01-01T00:00:00.000Z'
  try {
    await Promise.all(devices.map((db) => db.open()))
    for (const [index, db] of devices.entries()) {
      await mutateJournaledRecord(
        'birds',
        'bird',
        `device-${index}`,
        () => ({
          id: 'bird',
          name: `Vogel ${index}`,
          species: 'Wellensittich',
          createdAt: stamp,
          updatedAt: stamp,
        }),
        db,
      )
    }
    for (const [index, db] of devices.entries()) {
      expect((await db.birds.get('bird'))?.name).toBe(`Vogel ${index}`)
      expect((await db.deviceOperations.toArray()).map((op) => [op.deviceId, op.sequence])).toEqual(
        [[`device-${index}`, 1]],
      )
      expect(await db.appMetadata.count()).toBe(1)
    }
  } finally {
    await Promise.all(devices.map((db) => db.delete()))
  }
})

it('speichert Erstellung, Änderung und Löschung mit vorherigen Versionen und fortlaufender Sequenz', async () => {
  const bird = {
    id: 'a',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const first = await commitJournaledChange('birds', bird.id, bird, 'device-a')
  const second = await commitJournaledChange(
    'birds',
    bird.id,
    { ...bird, name: 'Luna' },
    'device-a',
  )
  const third = await commitJournaledChange('birds', bird.id, null, 'device-a')
  expect([first?.sequence, second?.sequence, third?.sequence]).toEqual([1, 2, 3])
  expect(second?.before?.name).toBe('Pico')
  expect(third?.before?.name).toBe('Luna')
  expect(third?.action).toBe('delete')
  expect(await appDatabase.birds.get('a')).toBeUndefined()
  expect(await appDatabase.deviceOperations.count()).toBe(3)
  expect(await commitJournaledChange('birds', 'a', null, 'device-a')).toBeNull()
})

it('rollt Datensatz und Protokoll bei einer Indexverletzung gemeinsam zurück', async () => {
  const stamp = '2026-01-01T00:00:00.000Z'
  const first = { id: 'one', itemType: 'wiki', itemId: 'a', createdAt: stamp, updatedAt: stamp }
  const other = { ...first, id: 'two' }
  await commitJournaledChange('favorites', first.id, first, 'device-a')
  await expect(commitJournaledChange('favorites', other.id, other, 'device-a')).rejects.toThrow()
  expect(await appDatabase.favorites.count()).toBe(1)
  expect(await appDatabase.deviceOperations.count()).toBe(1)
  expect((await appDatabase.appMetadata.get('device-operation-sequence:device-a'))?.value).toBe('1')
})

it('protokolliert allgemeine Repository-Schreibvorgänge nur bei aktiviertem Geräteabgleich', async () => {
  const { vi } = await import('vitest')
  const { feedMixRepository } = await import('../../data/repositories/feedMixRepository')
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  try {
    await feedMixRepository.create({ id: 'off', name: 'Ohne', ingredients: [] })
    expect(await appDatabase.deviceOperations.count()).toBe(0)
    values.set('welliathome-device-sync-enabled', 'true')
    await feedMixRepository.create({ id: 'on', name: 'Mit', ingredients: [] })
    await feedMixRepository.update('on', { name: 'Geändert' })
    await feedMixRepository.delete('on')
    const operations = await appDatabase.deviceOperations.orderBy('sequence').toArray()
    expect(operations.map((item) => item.action)).toEqual(['put', 'put', 'delete'])
    expect(operations[1].before?.name).toBe('Mit')
    expect(operations[2].before?.name).toBe('Geändert')
    expect(await appDatabase.feedMixes.get('off')).toBeTruthy()
    values.set('welliathome-device-sync-enabled', 'false')
    await feedMixRepository.create({ id: 'off-again', name: 'Erneut ohne', ingredients: [] })
    expect(await appDatabase.deviceOperations.count()).toBe(3)
    expect(await appDatabase.feedMixes.get('off-again')).toBeTruthy()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('initialisiert Futterempfehlungen auch bei aktiviertem Protokoll innerhalb einer Transaktion', async () => {
  const { vi } = await import('vitest')
  const { initializeFeedRecommendations } =
    await import('../feed-mixes/services/feedRecommendations')
  const values = new Map<string, string>([['welliathome-device-sync-enabled', 'true']])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  try {
    await initializeFeedRecommendations()
    expect(await appDatabase.feedMixes.count()).toBeGreaterThan(0)
    expect(await appDatabase.deviceOperations.count()).toBe(await appDatabase.feedMixes.count())
  } finally {
    vi.unstubAllGlobals()
  }
})

it('protokolliert Vogel mit Bild und abhängigen Einträgen atomar einschließlich Löschungen', async () => {
  const { vi } = await import('vitest')
  const { birdRepository } = await import('../../data/repositories/birdRepository')
  const { weightRepository } = await import('../../data/repositories/weightRepository')
  const values = new Map<string, string>([['welliathome-device-sync-enabled', 'true']])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  try {
    const blob = new Blob(['bild'], { type: 'image/png' })
    const bird = await birdRepository.createWithImage(
      { id: 'bird', name: 'Pico', species: 'Wellensittich' },
      { id: 'image', fileName: 'bild.png', mimeType: blob.type, fileSize: blob.size, blob },
    )
    await weightRepository.create({ id: 'weight', birdId: bird.id, weight: 40, date: '2026-01-01' })
    const counts = await birdRepository.getDependentRecordCounts(bird.id)
    await birdRepository.deleteWithRelatedData(bird.id, counts)
    const operations = await appDatabase.deviceOperations.orderBy('sequence').toArray()
    expect(operations.map((item) => `${item.tableName}:${item.action}`)).toEqual([
      'mediaAssets:put',
      'birds:put',
      'weights:put',
      'weights:delete',
      'birds:delete',
      'mediaAssets:delete',
    ])
    expect((operations[5].before?.blob as Blob).size).toBe(blob.size)
    expect(await appDatabase.birds.count()).toBe(0)
    expect(await appDatabase.mediaAssets.count()).toBe(0)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('vergibt nach einem Zurücksetzen der Datenbank eine neue Gerätekennung ohne Sequenzkollision', async () => {
  const { vi } = await import('vitest')
  const { deviceId } = await import('./fullExport')
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  try {
    const firstId = deviceId()
    const stamp = '2026-01-01T00:00:00.000Z'
    const bird = {
      id: 'first',
      name: 'Pico',
      species: 'Wellensittich',
      createdAt: stamp,
      updatedAt: stamp,
    }
    const first = await commitJournaledChange('birds', bird.id, bird, firstId)
    expect(first?.deviceId).toBe(firstId)
    await appDatabase.delete()
    await appDatabase.open()
    const next = await commitJournaledChange(
      'birds',
      'second',
      { ...bird, id: 'second' },
      deviceId(),
    )
    expect(next?.deviceId).not.toBe(firstId)
    expect(next?.deviceId).toBe(deviceId())
    expect(next?.sequence).toBe(1)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('verwendet nach einer Kennungsänderung für zusammengesetzte Vorgänge dieselbe neue Kennung', async () => {
  const { vi } = await import('vitest')
  const { deviceId } = await import('./fullExport')
  const { birdRepository } = await import('../../data/repositories/birdRepository')
  const values = new Map<string, string>([['welliathome-device-sync-enabled', 'true']])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  try {
    const old = deviceId()
    await birdRepository.create({ id: 'old', name: 'Alt', species: 'Wellensittich' })
    await appDatabase.delete()
    await appDatabase.open()
    const blob = new Blob(['bild'], { type: 'image/png' })
    await birdRepository.createWithImage(
      { id: 'new', name: 'Neu', species: 'Wellensittich' },
      { id: 'image', fileName: 'bild.png', mimeType: blob.type, fileSize: blob.size, blob },
    )
    const operations = await appDatabase.deviceOperations.toArray()
    expect(operations).toHaveLength(2)
    expect(new Set(operations.map((op) => op.deviceId))).toEqual(new Set([deviceId()]))
    expect(deviceId()).not.toBe(old)
    expect(operations.map((op) => op.sequence).sort()).toEqual([1, 2])
  } finally {
    vi.unstubAllGlobals()
  }
})
