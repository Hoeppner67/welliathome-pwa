import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { appDatabase } from '../../data/database/appDatabase'
import { createFullExport } from './fullExport'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
})

beforeEach(async () => {
  await appDatabase.delete()
  await appDatabase.open()
  storage.clear()
})
afterAll(async () => {
  await appDatabase.delete()
})

it('vergleicht Medien binär einschließlich Unterschieden am Dateiende', async () => {
  const { sameRow } = await import('./importFullExport')
  const row = (text: string, type = 'image/png') => ({
    id: 'media',
    blob: new Blob([text], { type }),
  })
  expect(await sameRow(row('abcdef'), row('abcdef'))).toBe(true)
  expect(await sameRow(row('abcdef'), row('abcdeg'))).toBe(false)
  expect(await sameRow(row('abcdef'), row('abcdef', 'image/jpeg'))).toBe(false)
  expect(await sameRow(row('abcdef'), row('abcde'))).toBe(false)
})

it('gibt keinen vollständigen Export mit ungültigen Datensätzen aus', async () => {
  const timestamp = '2026-01-01T00:00:00.000Z'
  await appDatabase.birds.add({
    id: 'invalid',
    name: '',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await expect(createFullExport()).rejects.toThrow()
  expect(await appDatabase.birds.count()).toBe(1)
})

it('zeigt eine Vorschau des vollständigen Imports, ohne Daten zu übernehmen', async () => {
  const { previewFullExport, importFullExport } = await import('./importFullExport')
  const timestamp = '2026-01-01T00:00:00.000Z'
  await appDatabase.birds.add({
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const file = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  expect(await previewFullExport(file)).toEqual({ additions: 1, conflicts: 0 })
  expect(await appDatabase.birds.count()).toBe(0)
  expect(await appDatabase.appMetadata.count()).toBe(0)
  expect(await importFullExport(file)).toBe('imported')
  expect((await previewFullExport(file)).alreadyImported).toBe(true)
})

it('exportiert persönliche Datensätze und Dokumente mit überprüfbaren Prüfsummen', async () => {
  const timestamp = '2026-01-01T00:00:00.000Z'
  await appDatabase.birds.add({
    id: 'bird-1',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const blob = new Blob(['Dokument'], { type: 'application/pdf' })
  await appDatabase.mediaAssets.add({
    id: 'doc-1',
    fileName: 'bericht.pdf',
    mimeType: blob.type,
    fileSize: blob.size,
    blob,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const firstFile = await createFullExport()
  const archive = unzipSync(new Uint8Array(await firstFile.arrayBuffer()))
  const manifest = JSON.parse(strFromU8(archive['manifest.json']))
  const data = JSON.parse(strFromU8(archive['data.json']))
  expect(manifest.formatVersion).toBe(2)
  expect(manifest.packageId).toBeTruthy()
  expect(firstFile.name).toMatch(
    /^wah_daten_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?\.zip$/,
  )
  expect(manifest.deviceId).toBeTruthy()
  expect(data.data.birds[0].name).toBe('Pico')
  expect(data.data.mediaAssets[0].mediaPath).toBe('media/0')
  expect(strFromU8(archive['media/0'])).toBe('Dokument')
  for (const [path, hash] of Object.entries(manifest.checksums)) {
    const digest = await crypto.subtle.digest('SHA-256', archive[path] as Uint8Array<ArrayBuffer>)
    expect(
      Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
    ).toBe(hash)
  }
  expect(await appDatabase.birds.count()).toBe(1)
  expect(await appDatabase.mediaAssets.count()).toBe(1)
  const secondFile = await createFullExport()
  const second = unzipSync(new Uint8Array(await secondFile.arrayBuffer()))
  const secondManifest = JSON.parse(strFromU8(second['manifest.json']))
  expect(secondManifest.deviceId).toBe(manifest.deviceId)
  expect(secondManifest.packageId).not.toBe(manifest.packageId)
  expect(secondFile.name).not.toBe(firstFile.name)
})

it('validiert exportierte Pakete und lehnt veränderte oder unvollständige Dateien ab', async () => {
  const { validateFullExport } = await import('./validateFullExport')
  const exported = await createFullExport()
  const parsed = await validateFullExport(exported)
  expect(parsed.data.birds).toEqual([])
  const zip = unzipSync(new Uint8Array(await exported.arrayBuffer()))
  zip['data.json'] = new TextEncoder().encode('{}')
  const { zipSync } = await import('fflate')
  await expect(
    validateFullExport(new Blob([zipSync(zip) as Uint8Array<ArrayBuffer>])),
  ).rejects.toThrow(/Prüfsumme/)
  const bytes = new Uint8Array(await exported.arrayBuffer())
  await expect(validateFullExport(new Blob([bytes.slice(0, -10)]))).rejects.toThrow()
  expect(await appDatabase.birds.count()).toBe(0)
})

it('liest weiterhin vollständige ZIP-Dateien im Format 1', async () => {
  const { validateFullExport } = await import('./validateFullExport')
  const { zipSync } = await import('fflate')
  const entries = unzipSync(new Uint8Array(await (await createFullExport()).arrayBuffer()))
  const payload = JSON.parse(strFromU8(entries['data.json']))
  delete payload.archives
  entries['data.json'] = new TextEncoder().encode(JSON.stringify(payload))
  const manifest = JSON.parse(strFromU8(entries['manifest.json']))
  manifest.formatVersion = 1
  const digest = await crypto.subtle.digest(
    'SHA-256',
    entries['data.json'] as Uint8Array<ArrayBuffer>,
  )
  manifest.checksums['data.json'] = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))
  expect(
    (await validateFullExport(new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>]))).archives,
  ).toEqual([])
})

it('verwirft eine wiederverwendete Paketkennung mit anderem Inhalt', async () => {
  const { importFullExport } = await import('./importFullExport')
  const { zipSync } = await import('fflate')
  const file = await createFullExport()
  expect(await importFullExport(file)).toBe('imported')
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const manifest = JSON.parse(strFromU8(entries['manifest.json']))
  manifest.createdAt =
    manifest.createdAt === '2026-01-01T00:00:00.000Z'
      ? '2026-01-02T00:00:00.000Z'
      : '2026-01-01T00:00:00.000Z'
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))
  await expect(
    importFullExport(new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>])),
  ).rejects.toThrow(/Paketkennung/)
})

it('verwirft ein verändertes Paket mit der Kennung eines offenen Konflikts', async () => {
  const { importFullExport } = await import('./importFullExport')
  const { zipSync } = await import('fflate')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Paket',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await appDatabase.birds.add(bird)
  const file = await createFullExport()
  await appDatabase.birds.put({ ...bird, name: 'Lokal' })
  expect(await importFullExport(file)).toBe('conflicts')
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const manifest = JSON.parse(strFromU8(entries['manifest.json']))
  manifest.createdAt = '2026-01-02T00:00:00.000Z'
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))
  await expect(
    importFullExport(new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>])),
  ).rejects.toThrow(/Paketkennung/)
  expect((await appDatabase.birds.get('bird'))?.name).toBe('Lokal')
  expect((await appDatabase.devicePendingPackages.toArray())[0].conflicts[0].incoming?.name).toBe(
    'Paket',
  )
})

it('weist ein Paket mit gültiger Prüfsumme, aber fehlendem Vogelverweis zurück', async () => {
  const { validateFullExport } = await import('./validateFullExport')
  const { zipSync } = await import('fflate')
  const archive = unzipSync(new Uint8Array(await (await createFullExport()).arrayBuffer()))
  const payload = JSON.parse(strFromU8(archive['data.json']))
  payload.data.weights.push({
    id: 'weight-1',
    birdId: 'missing',
    weight: 40,
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
  archive['data.json'] = new TextEncoder().encode(JSON.stringify(payload))
  const manifest = JSON.parse(strFromU8(archive['manifest.json']))
  const digest = await crypto.subtle.digest(
    'SHA-256',
    archive['data.json'] as Uint8Array<ArrayBuffer>,
  )
  manifest.checksums['data.json'] = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
  archive['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))
  await expect(
    validateFullExport(new Blob([zipSync(archive) as Uint8Array<ArrayBuffer>])),
  ).rejects.toThrow(/Vogelverweis/)
  expect(await appDatabase.weights.count()).toBe(0)
})

it('stellt ein Paket atomar auf leerem Gerät wieder her und verarbeitet es nur einmal', async () => {
  const { importFullExport } = await import('./importFullExport')
  const timestamp = '2026-01-01T00:00:00.000Z'
  await appDatabase.birds.add({
    id: 'bird-1',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const blob = new Blob(['Foto'], { type: 'image/png' })
  await appDatabase.mediaAssets.add({
    id: 'photo-1',
    fileName: 'foto.png',
    mimeType: blob.type,
    fileSize: blob.size,
    blob,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const file = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  expect(await importFullExport(file)).toBe('imported')
  expect((await appDatabase.birds.get('bird-1'))?.name).toBe('Pico')
  expect(await (await appDatabase.mediaAssets.get('photo-1'))?.blob.text()).toBe('Foto')
  expect(await importFullExport(file)).toBe('already-imported')
  expect(await appDatabase.birds.count()).toBe(1)
})

it('stellt Vogelbild und Dokument auf einem neuen Gerät wieder her, ohne Duplikate bei erneutem Export', async () => {
  const { importFullExport } = await import('./importFullExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const photo = new Blob(['Foto'], { type: 'image/png' })
  const document = new Blob(['Befund'], { type: 'application/pdf' })
  await appDatabase.birds.add({
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    imageId: 'photo',
    createdAt: stamp,
    updatedAt: stamp,
  })
  await appDatabase.mediaAssets.bulkAdd([
    {
      id: 'photo',
      fileName: 'foto.png',
      mimeType: photo.type,
      fileSize: photo.size,
      blob: photo,
      relatedType: 'bird-profile',
      relatedId: 'bird',
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: 'document',
      fileName: 'befund.pdf',
      mimeType: document.type,
      fileSize: document.size,
      blob: document,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ])
  const first = await createFullExport()
  const second = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  expect(await importFullExport(first)).toBe('imported')
  expect(await importFullExport(second)).toBe('imported')
  expect((await appDatabase.birds.get('bird'))?.imageId).toBe('photo')
  expect(await (await appDatabase.mediaAssets.get('photo'))?.blob.text()).toBe('Foto')
  expect(await (await appDatabase.mediaAssets.get('document'))?.blob.text()).toBe('Befund')
  expect(await appDatabase.mediaAssets.count()).toBe(2)
})

it('führt unterschiedliche neue Datensätze zusammen und erkennt bereits vorhandene Datensätze', async () => {
  const { importFullExport } = await import('./importFullExport')
  const timestamp = '2026-01-01T00:00:00.000Z'
  await appDatabase.birds.add({
    id: 'remote',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const first = await createFullExport()
  const second = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.add({
    id: 'local',
    name: 'Lokal',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  expect(await importFullExport(first)).toBe('imported')
  expect(await importFullExport(second)).toBe('imported')
  expect((await appDatabase.birds.toArray()).map((bird) => bird.id).sort()).toEqual([
    'local',
    'remote',
  ])
})

it('bricht bei konkurrierenden Datensätzen vollständig ab und bewahrt beide lokalen Datensätze', async () => {
  const { importFullExport } = await import('./importFullExport')
  const timestamp = '2026-01-01T00:00:00.000Z'
  await appDatabase.birds.bulkAdd([
    {
      id: 'remote',
      name: 'Neu',
      species: 'Wellensittich',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'same',
      name: 'Quelle',
      species: 'Wellensittich',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ])
  const file = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.add({
    id: 'same',
    name: 'Lokal',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  expect(await importFullExport(file)).toBe('conflicts')
  expect((await appDatabase.birds.get('same'))?.name).toBe('Lokal')
  expect(await appDatabase.birds.get('remote')).toBeUndefined()
  expect(await appDatabase.appMetadata.get('device-import-last-successful-at')).toBeUndefined()
  const pending = await appDatabase.devicePendingPackages.toArray()
  expect(pending).toHaveLength(1)
  expect(pending[0].conflicts[0].local?.name).toBe('Lokal')
  expect(pending[0].conflicts[0].incoming?.name).toBe('Quelle')
  expect(await importFullExport(file)).toBe('conflicts')
  expect(await appDatabase.devicePendingPackages.count()).toBe(1)
})

it('erhält unabhängige Futterempfehlungen mit verschiedenen IDs', async () => {
  const { initializeFeedRecommendations } =
    await import('../feed-mixes/services/feedRecommendations')
  const { importFullExport } = await import('./importFullExport')
  await initializeFeedRecommendations()
  const count = await appDatabase.feedMixes.count()
  const file = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  await initializeFeedRecommendations()
  await importFullExport(file)
  expect(await appDatabase.feedMixes.count()).toBe(count * 2)
})

it('meldet verschiedene Favoriten-IDs mit gleichem fachlichen Schlüssel als Konflikt', async () => {
  const { importFullExport, previewFullExport } = await import('./importFullExport')
  const timestamp = '2026-01-01T00:00:00.000Z'
  const favorite = {
    itemType: 'article',
    itemId: 'item',
    title: 'Gleich',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await appDatabase.favorites.add({ id: 'remote', ...favorite })
  const file = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.favorites.add({ id: 'local', ...favorite })
  expect((await previewFullExport(file)).conflicts).toBe(1)
  expect(await importFullExport(file)).toBe('conflicts')
  expect((await appDatabase.favorites.toArray()).map((item) => item.id)).toEqual(['local'])
})

it('erkennt abweichende Mediendaten bei gleicher ID als Konflikt', async () => {
  const { importFullExport } = await import('./importFullExport')
  const timestamp = '2026-01-01T00:00:00.000Z'
  const asset = {
    id: 'image',
    fileName: 'foto.png',
    mimeType: 'image/png',
    fileSize: 4,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await appDatabase.mediaAssets.add({ ...asset, blob: new Blob(['aaaa'], { type: 'image/png' }) })
  const file = await createFullExport()
  await appDatabase.mediaAssets.put({ ...asset, blob: new Blob(['bbbb'], { type: 'image/png' }) })
  expect(await importFullExport(file)).toBe('conflicts')
  expect(await (await appDatabase.mediaAssets.get('image'))?.blob.text()).toBe('bbbb')
})

it('behält bei Konfliktlösung die lokale Version und archiviert die Paketversion', async () => {
  const { importFullExport, resolveKeepingLocal } = await import('./importFullExport')
  const timestamp = '2026-01-01T00:00:00.000Z'
  await appDatabase.birds.bulkAdd([
    {
      id: 'same',
      name: 'Paket',
      species: 'Wellensittich',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'new',
      name: 'Neu',
      species: 'Wellensittich',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ])
  const archive = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.add({
    id: 'same',
    name: 'Lokal',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  storage.set('welliathome-device-sync-enabled', 'true')
  expect(await importFullExport(archive)).toBe('conflicts')
  const pending = (await appDatabase.devicePendingPackages.toArray())[0]
  await resolveKeepingLocal(pending.packageId)
  expect((await appDatabase.birds.get('same'))?.name).toBe('Lokal')
  expect((await appDatabase.birds.get('new'))?.name).toBe('Neu')
  const stored = await appDatabase.devicePendingPackages.get(pending.packageId)
  expect(stored?.resolvedAt).toBeTruthy()
  expect(stored?.conflicts[0].incoming?.name).toBe('Paket')
  const decision = (await appDatabase.deviceOperations.toArray()).find(
    (operation) => operation.recordId === 'same',
  )
  expect(decision?.before?.name).toBe('Paket')
  expect(decision?.after?.name).toBe('Lokal')
  expect(await importFullExport(archive)).toBe('already-imported')
})

it('bricht eine Konfliktlösung ab, wenn sich die lokale Version inzwischen geändert hat', async () => {
  const { importFullExport, resolveKeepingLocal } = await import('./importFullExport')
  const timestamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'same',
    name: 'Paket',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await appDatabase.birds.add(bird)
  const archive = await createFullExport()
  await appDatabase.birds.put({ ...bird, name: 'Lokal' })
  expect(await importFullExport(archive)).toBe('conflicts')
  const pending = (await appDatabase.devicePendingPackages.toArray())[0]
  await appDatabase.birds.put({ ...bird, name: 'Später geändert' })
  await expect(resolveKeepingLocal(pending.packageId)).rejects.toThrow(/geändert/)
  expect((await appDatabase.birds.get('same'))?.name).toBe('Später geändert')
  expect(
    (await appDatabase.devicePendingPackages.get(pending.packageId))?.resolvedAt,
  ).toBeUndefined()
})

it('übernimmt Paketversionen und bewahrt die vorherigen lokalen Versionen im Konfliktarchiv', async () => {
  const { importFullExport, resolveUsingIncoming } = await import('./importFullExport')
  const timestamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'same',
    name: 'Paket',
    species: 'Wellensittich',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await appDatabase.birds.add(bird)
  const archive = await createFullExport()
  await appDatabase.birds.put({ ...bird, name: 'Lokal' })
  expect(await importFullExport(archive)).toBe('conflicts')
  const pending = (await appDatabase.devicePendingPackages.toArray())[0]
  await resolveUsingIncoming(pending.packageId)
  expect((await appDatabase.birds.get('same'))?.name).toBe('Paket')
  const stored = await appDatabase.devicePendingPackages.get(pending.packageId)
  expect(stored?.conflicts[0].local?.name).toBe('Lokal')
  expect(stored?.conflicts[0].incoming?.name).toBe('Paket')
  expect(stored?.resolvedAt).toBeTruthy()
})

it('überträgt ein abgeschlossenes Konfliktarchiv mit beiden Mediendateien auf ein neues Gerät', async () => {
  const { importFullExport, resolveUsingIncoming } = await import('./importFullExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const asset = {
    id: 'image',
    fileName: 'foto.png',
    mimeType: 'image/png',
    fileSize: 4,
    createdAt: stamp,
    updatedAt: stamp,
  }
  await appDatabase.mediaAssets.add({ ...asset, blob: new Blob(['fern'], { type: 'image/png' }) })
  const original = await createFullExport()
  await appDatabase.mediaAssets.put({ ...asset, blob: new Blob(['hier'], { type: 'image/png' }) })
  expect(await importFullExport(original)).toBe('conflicts')
  const pending = (await appDatabase.devicePendingPackages.toArray())[0]
  await resolveUsingIncoming(pending.packageId)
  const complete = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  expect(await importFullExport(complete)).toBe('imported')
  const restored = await appDatabase.devicePendingPackages.get(pending.packageId)
  expect(restored?.resolvedChoice).toBe('incoming')
  expect(await (restored?.conflicts[0].local?.blob as Blob).text()).toBe('hier')
  expect(await (restored?.conflicts[0].incoming?.blob as Blob).text()).toBe('fern')
  expect(await restored?.archive.arrayBuffer()).toEqual(await original.arrayBuffer())
  expect(await importFullExport(complete)).toBe('already-imported')
})

it('weist unterschiedliche Konfliktarchive mit gleicher Kennung atomar zurück', async () => {
  const { importFullExport } = await import('./importFullExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Paket',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await appDatabase.birds.add(bird)
  const original = await createFullExport()
  await appDatabase.birds.put({ ...bird, name: 'Lokal' })
  expect(await importFullExport(original)).toBe('conflicts')
  const stored = (await appDatabase.devicePendingPackages.toArray())[0]
  const exported = await createFullExport()
  await appDatabase.devicePendingPackages.put({ ...stored, createdAt: '2026-01-01T00:00:00.000Z' })
  await expect(importFullExport(exported)).rejects.toThrow(/Konfliktarchiv/)
  expect((await appDatabase.devicePendingPackages.get(stored.packageId))?.createdAt).toBe(
    '2026-01-01T00:00:00.000Z',
  )
  expect((await appDatabase.birds.get('bird'))?.name).toBe('Lokal')
})

it('rollt den Import zurück, wenn die zusammengeführten Daten einen ungültigen Bildverweis enthalten', async () => {
  const { importFullExport } = await import('./importFullExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  await appDatabase.birds.add({
    id: 'incoming',
    name: 'Neu',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  })
  const archive = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.add({
    id: 'local',
    name: 'Lokal',
    species: 'Wellensittich',
    imageId: 'missing',
    createdAt: stamp,
    updatedAt: stamp,
  })
  await expect(importFullExport(archive)).rejects.toThrow(/Bildverweis/)
  expect(await appDatabase.birds.get('incoming')).toBeUndefined()
  expect((await appDatabase.birds.get('local'))?.imageId).toBe('missing')
  expect(await appDatabase.appMetadata.get('device-import-last-successful-at')).toBeUndefined()
})

it('protokolliert beim vollständigen Import neue Datensätze atomar und nur einmal', async () => {
  const { importFullExport } = await import('./importFullExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  await appDatabase.birds.add({
    id: 'incoming',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  })
  const archive = await createFullExport()
  await appDatabase.delete()
  await appDatabase.open()
  storage.set('welliathome-device-sync-enabled', 'true')
  expect(await importFullExport(archive)).toBe('imported')
  const operations = await appDatabase.deviceOperations.toArray()
  expect(operations).toHaveLength(1)
  expect(operations[0]).toMatchObject({
    action: 'put',
    tableName: 'birds',
    recordId: 'incoming',
    before: null,
    after: { name: 'Pico' },
  })
  expect(await importFullExport(archive)).toBe('already-imported')
  expect(await appDatabase.deviceOperations.count()).toBe(1)
})
