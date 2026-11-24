import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { appDatabase } from '../../data/database/appDatabase'
import { commitJournaledChange } from './changeJournal'
import { createChangesExport } from './changesExport'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
})
beforeEach(async () => {
  await appDatabase.delete()
  await appDatabase.open()
  values.clear()
})
afterAll(async () => {
  await appDatabase.delete()
  vi.unstubAllGlobals()
})

it('begrenzt die tatsächliche entpackte Größe und Dateianzahl über mehrere Pakete', async () => {
  const validator = await import('./validateChangesExport')
  const { importChangesExports } = await import('./importChangesExport')
  const files = [new Blob(['a']), new Blob(['b'])]
  const validate = vi.spyOn(validator, 'validateChangesExport')
  const result = {
    packageId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    operations: [],
    entryCount: 5002,
    expandedBytes: 1,
  }
  try {
    validate.mockResolvedValue(result)
    await expect(importChangesExports(files)).rejects.toThrow(/zusammen zu viele Dateien/)
    validate.mockResolvedValue({ ...result, entryCount: 2, expandedBytes: 60 * 1024 * 1024 })
    await expect(importChangesExports(files)).rejects.toThrow(/zusammen 100 MB/)
    expect(await appDatabase.deviceOperations.count()).toBe(0)
    expect(await appDatabase.appMetadata.count()).toBe(0)
  } finally {
    validate.mockRestore()
  }
})

it('lehnt dieselbe Paketkennung für verschiedene Paketarten in beiden Reihenfolgen ab', async () => {
  const { createFullExport } = await import('./fullExport')
  const { importFullExport } = await import('./importFullExport')
  const { importChangesExport } = await import('./importChangesExport')
  const full = await createFullExport()
  const changes = await createChangesExport()
  const fullZip = unzipSync(new Uint8Array(await full.arrayBuffer()))
  const changesZip = unzipSync(new Uint8Array(await changes.arrayBuffer()))
  const fullManifest = JSON.parse(strFromU8(fullZip['manifest.json']))
  const changesManifest = JSON.parse(strFromU8(changesZip['manifest.json']))
  changesManifest.packageId = fullManifest.packageId
  changesZip['manifest.json'] = strToU8(JSON.stringify(changesManifest))
  const duplicateChanges = new Blob([zipSync(changesZip) as Uint8Array<ArrayBuffer>])
  await importFullExport(full)
  await expect(importChangesExport(duplicateChanges)).rejects.toThrow(/Paketkennung/)

  await appDatabase.delete()
  await appDatabase.open()
  await importChangesExport(changes)
  fullManifest.packageId = JSON.parse(
    strFromU8(unzipSync(new Uint8Array(await changes.arrayBuffer()))['manifest.json']),
  ).packageId
  fullZip['manifest.json'] = strToU8(JSON.stringify(fullManifest))
  const duplicateFull = new Blob([zipSync(fullZip) as Uint8Array<ArrayBuffer>])
  await expect(importFullExport(duplicateFull)).rejects.toThrow(/Paketkennung/)
})

it('gibt kein Änderungspaket mit ungültigen Datensätzen aus', async () => {
  const stamp = '2026-01-01T00:00:00.000Z'
  await commitJournaledChange(
    'birds',
    'invalid',
    { id: 'invalid', name: '', species: 'Wellensittich', createdAt: stamp, updatedAt: stamp },
    crypto.randomUUID(),
  )
  await expect(createChangesExport()).rejects.toThrow()
  expect(await appDatabase.deviceOperations.count()).toBe(1)
})

it('prüft Änderungen einschließlich Referenzen, ohne Daten oder Importstatus zu übernehmen', async () => {
  const { previewChangesExport, importChangesExport } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('birds', bird.id, bird, crypto.randomUUID())
  const file = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  expect(await previewChangesExport(file)).toEqual({ applied: 1, alreadyKnown: 0 })
  expect(await appDatabase.birds.count()).toBe(0)
  expect(await appDatabase.deviceOperations.count()).toBe(0)
  expect(await appDatabase.appMetadata.count()).toBe(0)
  expect((await importChangesExport(file)).applied).toBe(1)
  expect((await previewChangesExport(file)).alreadyKnown).toBe(1)
})

it('prüft und importiert mehrere überlappende Pakete unabhängig von ihrer Reihenfolge atomar', async () => {
  const { previewChangesExports, importChangesExports } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const origin = crypto.randomUUID()
  await commitJournaledChange(
    'birds',
    'a',
    { id: 'a', name: 'Pico', species: 'Wellensittich', createdAt: stamp, updatedAt: stamp },
    origin,
  )
  const first = await createChangesExport()
  await commitJournaledChange(
    'birds',
    'b',
    { id: 'b', name: 'Luna', species: 'Wellensittich', createdAt: stamp, updatedAt: stamp },
    origin,
  )
  const second = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  await expect(importChangesExports([first, new Blob(['beschädigt'])])).rejects.toThrow()
  expect(await appDatabase.birds.count()).toBe(0)
  expect((await previewChangesExports([second, first])).applied).toBe(2)
  expect(await appDatabase.birds.count()).toBe(0)
  expect((await importChangesExports([second, first])).applied).toBe(2)
  expect(await appDatabase.birds.count()).toBe(2)
  expect((await importChangesExports([first, second])).alreadyKnown).toBe(2)
})

it('übernimmt bei einem Konflikt in einer Mehrfachauswahl keines der Pakete', async () => {
  const { previewChangesExports, importChangesExports } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const origin = crypto.randomUUID()
  const bird = {
    id: 'a',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('birds', 'a', bird, origin)
  const first = await createChangesExport()
  await commitJournaledChange('birds', 'b', { ...bird, id: 'b', name: 'Luna' }, origin)
  const second = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.add({ ...bird, name: 'Lokal' })
  expect((await previewChangesExports([first, second])).conflicts).toBe(1)
  await expect(importChangesExports([first, second])).rejects.toThrow(/einzeln/)
  expect((await appDatabase.birds.toArray()).map((item) => item.name)).toEqual(['Lokal'])
  expect(await appDatabase.deviceOperations.count()).toBe(0)
  expect(await appDatabase.devicePendingPackages.count()).toBe(0)
})

it('exportiert Änderungen und Mediendaten wiederholt, ohne Operationen als zugestellt zu markieren', async () => {
  const stamp = '2026-01-01T00:00:00.000Z'
  const blob = new Blob(['bild'], { type: 'image/png' })
  const record = {
    id: 'image',
    fileName: 'bild.png',
    mimeType: blob.type,
    fileSize: blob.size,
    blob,
    createdAt: stamp,
    updatedAt: stamp,
  }
  const origin = crypto.randomUUID()
  await commitJournaledChange('mediaAssets', record.id, record, origin)
  await commitJournaledChange('mediaAssets', record.id, null, origin)
  const firstFile = await createChangesExport()
  const secondFile = await createChangesExport()
  const first = unzipSync(new Uint8Array(await firstFile.arrayBuffer()))
  const second = unzipSync(new Uint8Array(await secondFile.arrayBuffer()))
  const ops = JSON.parse(strFromU8(first['operations.json']))
  const manifest = JSON.parse(strFromU8(first['manifest.json']))
  expect(firstFile.name).toMatch(
    /^wah_update_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?\.zip$/,
  )
  expect(secondFile.name).not.toBe(firstFile.name)
  expect(ops.map((item: { action: string }) => item.action)).toEqual(['put', 'delete'])
  expect(strFromU8(first[ops[0].after.mediaPath])).toBe('bild')
  expect(strFromU8(first[ops[1].before.mediaPath])).toBe('bild')
  expect(strFromU8(second['operations.json'])).toBe(strFromU8(first['operations.json']))
  expect(JSON.parse(strFromU8(second['manifest.json'])).packageId).not.toBe(manifest.packageId)
  expect(await appDatabase.deviceOperations.count()).toBe(2)
  const { validateChangesExport } = await import('./validateChangesExport')
  const valid = await validateChangesExport(await createChangesExport())
  expect(valid.operations).toHaveLength(2)
  expect(valid.operations[0].deviceId).toBe(origin)
  for (const [path, expected] of Object.entries(manifest.checksums)) {
    const digest = await crypto.subtle.digest('SHA-256', first[path] as Uint8Array<ArrayBuffer>)
    expect(
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    ).toBe(expected)
  }
})

it('verwirft manipulierte Operationen und beschädigte Pakete ohne Datenbankänderung', async () => {
  const { zipSync } = await import('fflate')
  const { validateChangesExport } = await import('./validateChangesExport')
  const original = await createChangesExport()
  const files = unzipSync(new Uint8Array(await original.arrayBuffer()))
  files['operations.json'] = new TextEncoder().encode('[{}]')
  await expect(
    validateChangesExport(new Blob([zipSync(files) as Uint8Array<ArrayBuffer>])),
  ).rejects.toThrow(/Prüfsumme/)
  await expect(
    validateChangesExport(new Blob([new Uint8Array(await original.arrayBuffer()).slice(0, -8)])),
  ).rejects.toThrow()
  expect(await appDatabase.deviceOperations.count()).toBe(0)
})

it('weist eine unbekannte Änderungspaketversion vor jeder Datenbankänderung zurück', async () => {
  const { importChangesExport } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'local',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await appDatabase.birds.add(bird)
  const entries = unzipSync(new Uint8Array(await (await createChangesExport()).arrayBuffer()))
  const manifest = JSON.parse(strFromU8(entries['manifest.json']))
  manifest.formatVersion = 2
  entries['manifest.json'] = strToU8(JSON.stringify(manifest))
  await expect(
    importChangesExport(new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>])),
  ).rejects.toThrow(/manifest/i)
  expect(await appDatabase.birds.toArray()).toEqual([bird])
  expect(await appDatabase.deviceOperations.count()).toBe(0)
  expect(await appDatabase.devicePendingPackages.count()).toBe(0)
})

it('importiert Operationen einmalig in Reihenfolge und überträgt Löschungen', async () => {
  const { importChangesExport } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  const origin = crypto.randomUUID()
  await commitJournaledChange('birds', bird.id, bird, origin)
  await commitJournaledChange('birds', bird.id, { ...bird, name: 'Luna' }, origin)
  await commitJournaledChange('birds', bird.id, null, origin)
  const archive = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  expect(await importChangesExport(archive)).toEqual({ applied: 3, alreadyKnown: 0 })
  expect(await appDatabase.birds.get('bird')).toBeUndefined()
  expect(await importChangesExport(archive)).toEqual({ applied: 0, alreadyKnown: 3 })
  expect(await appDatabase.deviceOperations.count()).toBe(3)
})

it('rollt Datensätze und Journal bei einem Schreibfehler während des Imports zurück', async () => {
  const { importChangesExport } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const origin = crypto.randomUUID()
  for (const id of ['a', 'b']) {
    await commitJournaledChange(
      'birds',
      id,
      { id, name: id, species: 'Wellensittich', createdAt: stamp, updatedAt: stamp },
      origin,
    )
  }
  const archive = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  const original = appDatabase.deviceOperations.add.bind(appDatabase.deviceOperations)
  const add = vi.spyOn(appDatabase.deviceOperations, 'add')
  let calls = 0
  add.mockImplementation((...args) => {
    if (++calls === 2)
      return Promise.reject(new Error('Simulierter Speicherfehler')) as ReturnType<typeof add>
    return original(...args)
  })
  try {
    await expect(importChangesExport(archive)).rejects.toThrow('Simulierter Speicherfehler')
    expect(await appDatabase.birds.count()).toBe(0)
    expect(await appDatabase.deviceOperations.count()).toBe(0)
    expect(await appDatabase.appMetadata.count()).toBe(0)
  } finally {
    add.mockRestore()
  }
})

it('überträgt unvollständige Vogeldaten über Änderungspaket, vollständiges ZIP und Backup', async () => {
  const { createFullExport } = await import('./fullExport')
  const { importFullExport } = await import('./importFullExport')
  const { importChangesExport } = await import('./importChangesExport')
  const { createBackupJson, parseBackupJson, restoreBackup } =
    await import('../backup/backupService')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    hatchDate: 'Juli 2020',
    arrivalDate: '03/23',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('birds', bird.id, bird, crypto.randomUUID())
  const changes = await createChangesExport()
  const snapshot = await createFullExport()
  const backup = await createBackupJson()
  await appDatabase.delete()
  await appDatabase.open()
  await importChangesExport(changes)
  expect(await appDatabase.birds.get(bird.id)).toMatchObject({
    hatchDate: 'Juli 2020',
    arrivalDate: '03/23',
  })
  await appDatabase.delete()
  await appDatabase.open()
  await importFullExport(snapshot)
  expect(await appDatabase.birds.get(bird.id)).toMatchObject({
    hatchDate: 'Juli 2020',
    arrivalDate: '03/23',
  })
  await appDatabase.delete()
  await appDatabase.open()
  await restoreBackup(await parseBackupJson(backup))
  expect(await appDatabase.birds.get(bird.id)).toMatchObject({
    hatchDate: 'Juli 2020',
    arrivalDate: '03/23',
  })
})

it('übernimmt nach einer vollständigen Ersteinrichtung nur spätere Änderungen ohne Scheinkonflikt', async () => {
  const { createFullExport } = await import('./fullExport')
  const { importFullExport } = await import('./importFullExport')
  const { importChangesExport } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  const origin = crypto.randomUUID()
  await commitJournaledChange('birds', bird.id, bird, origin)
  await commitJournaledChange('birds', bird.id, { ...bird, name: 'Luna' }, origin)
  const initial = await createFullExport()
  await commitJournaledChange('birds', bird.id, { ...bird, name: 'Mila' }, origin)
  const changes = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  expect(await importFullExport(initial)).toBe('imported')
  expect(await importChangesExport(changes)).toEqual({ applied: 3, alreadyKnown: 0 })
  expect((await appDatabase.birds.get(bird.id))?.name).toBe('Mila')
  expect(await importChangesExport(changes)).toEqual({ applied: 0, alreadyKnown: 3 })
})

it('rollt ein Änderungspaket mit konkurrierender Änderung vollständig zurück', async () => {
  const { importChangesExport } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  const origin = crypto.randomUUID()
  await commitJournaledChange('birds', bird.id, bird, origin)
  const archive = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.add({ ...bird, name: 'Lokal' })
  expect(await importChangesExport(archive)).toEqual({ applied: 0, alreadyKnown: 0, conflicts: 1 })
  expect(await appDatabase.devicePendingPackages.count()).toBe(1)
  expect((await appDatabase.birds.get('bird'))?.name).toBe('Lokal')
  expect(await appDatabase.deviceOperations.count()).toBe(0)
})

it('verwirft wiederverwendete Paketkennungen bei anderem Inhalt', async () => {
  const { importChangesExport } = await import('./importChangesExport')
  const { zipSync } = await import('fflate')
  const original = await createChangesExport()
  expect(await importChangesExport(original)).toEqual({ applied: 0, alreadyKnown: 0 })
  const entries = unzipSync(new Uint8Array(await original.arrayBuffer()))
  const manifest = JSON.parse(strFromU8(entries['manifest.json']))
  manifest.createdAt = '2026-01-01T00:00:00.000Z'
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))
  await expect(
    importChangesExport(new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>])),
  ).rejects.toThrow(/Paketkennung/)
})

it('überträgt ein Vogelprofil mit Bild und verhindert Löschungen mit lokalen abhängigen Einträgen', async () => {
  const { importChangesExport } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const origin = crypto.randomUUID()
  const blob = new Blob(['bild'], { type: 'image/png' })
  const media = {
    id: 'image',
    fileName: 'bild.png',
    mimeType: blob.type,
    fileSize: blob.size,
    blob,
    relatedType: 'bird-profile',
    relatedId: 'bird',
    createdAt: stamp,
    updatedAt: stamp,
  }
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    imageId: 'image',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('mediaAssets', media.id, media, origin)
  await commitJournaledChange('birds', bird.id, bird, origin)
  const first = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  expect(await importChangesExport(first)).toEqual({ applied: 2, alreadyKnown: 0 })
  expect(await (await appDatabase.mediaAssets.get('image'))?.blob.text()).toBe('bild')
  await appDatabase.weights.add({
    id: 'local-weight',
    birdId: 'bird',
    weight: 40,
    date: '2026-01-01',
    createdAt: stamp,
    updatedAt: stamp,
  })
  await appDatabase.delete()
  await appDatabase.open()
  await commitJournaledChange('mediaAssets', media.id, media, origin)
  await commitJournaledChange('birds', bird.id, bird, origin)
  await commitJournaledChange('birds', bird.id, null, origin)
  await commitJournaledChange('mediaAssets', media.id, null, origin)
  const deletion = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.add(bird)
  await appDatabase.mediaAssets.add(media)
  await appDatabase.weights.add({
    id: 'local-weight',
    birdId: 'bird',
    weight: 40,
    date: '2026-01-01',
    createdAt: stamp,
    updatedAt: stamp,
  })
  await expect(importChangesExport(deletion)).rejects.toThrow(/Vogelverweis/)
  expect(await appDatabase.birds.get('bird')).toBeTruthy()
  expect(await appDatabase.mediaAssets.get('image')).toBeTruthy()
  expect(await appDatabase.deviceOperations.count()).toBe(0)
})

it('behält eine lokale Konfliktversion und erstellt eine weitergebbare Ausgleichsoperation', async () => {
  const { importChangesExport, resolveChanges } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Paket',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('birds', bird.id, bird, crypto.randomUUID())
  const archive = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.add({ ...bird, name: 'Lokal' })
  expect((await importChangesExport(archive)).conflicts).toBe(1)
  const pending = (await appDatabase.devicePendingPackages.toArray())[0]
  expect(pending.conflicts[0].local?.name).toBe('Lokal')
  expect(pending.conflicts[0].incoming?.name).toBe('Paket')
  expect((await resolveChanges(pending.packageId, 'local')).applied).toBe(1)
  expect((await appDatabase.birds.get('bird'))?.name).toBe('Lokal')
  expect(await appDatabase.deviceOperations.count()).toBe(2)
  expect((await appDatabase.devicePendingPackages.get(pending.packageId))?.resolvedAt).toBeTruthy()
  expect((await importChangesExport(archive)).alreadyKnown).toBe(1)
})

it('übernimmt eine konkurrierende Paketversion und bewahrt die lokale Version', async () => {
  const { importChangesExport, resolveChanges } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Paket',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('birds', bird.id, bird, crypto.randomUUID())
  const archive = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.add({ ...bird, name: 'Lokal' })
  expect((await importChangesExport(archive)).conflicts).toBe(1)
  const pending = (await appDatabase.devicePendingPackages.toArray())[0]
  expect((await resolveChanges(pending.packageId, 'incoming')).applied).toBe(1)
  expect((await appDatabase.birds.get('bird'))?.name).toBe('Paket')
  expect(
    (await appDatabase.devicePendingPackages.get(pending.packageId))?.conflicts[0].local?.name,
  ).toBe('Lokal')
  const operations = await appDatabase.deviceOperations.toArray()
  expect(operations).toHaveLength(2)
  expect(operations.find((operation) => operation.before?.name === 'Lokal')?.after?.name).toBe(
    'Paket',
  )
})

it('setzt bei erneut eingerichteter Datenbank die lokale Operationssequenz nach dem Import fort', async () => {
  const { importChangesExport } = await import('./importChangesExport')
  const { deviceId } = await import('./fullExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const origin = deviceId()
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('birds', bird.id, bird, origin)
  const archive = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  await importChangesExport(archive)
  const next = await commitJournaledChange('birds', bird.id, { ...bird, name: 'Luna' }, origin)
  expect(next?.sequence).toBe(2)
})

it('verwirft lückenhafte Operationsfolgen bevor spätere Löschungen als erledigt gelten', async () => {
  const { importChangesExport } = await import('./importChangesExport')
  const { zipSync } = await import('fflate')
  const stamp = '2026-01-01T00:00:00.000Z'
  const origin = crypto.randomUUID()
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('birds', bird.id, bird, origin)
  await commitJournaledChange('birds', bird.id, null, origin)
  const entries = unzipSync(new Uint8Array(await (await createChangesExport()).arrayBuffer()))
  const operations = JSON.parse(strFromU8(entries['operations.json']))
  entries['operations.json'] = new TextEncoder().encode(JSON.stringify([operations[1]]))
  const manifest = JSON.parse(strFromU8(entries['manifest.json']))
  const digest = await crypto.subtle.digest(
    'SHA-256',
    entries['operations.json'] as Uint8Array<ArrayBuffer>,
  )
  manifest.checksums['operations.json'] = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))
  const incomplete = new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>])
  await appDatabase.delete()
  await appDatabase.open()
  await expect(importChangesExport(incomplete)).rejects.toThrow(/Lücke/)
  expect(await appDatabase.deviceOperations.count()).toBe(0)
  expect(await appDatabase.birds.get('bird')).toBeUndefined()
})

it('stellt bei späterem Import eines älteren Pakets keine bereits gelöschten Daten wieder her', async () => {
  const { importChangesExport } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  const origin = crypto.randomUUID()
  await commitJournaledChange('birds', bird.id, bird, origin)
  const older = await createChangesExport()
  await commitJournaledChange('birds', bird.id, null, origin)
  const newer = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  expect((await importChangesExport(newer)).applied).toBe(2)
  expect((await importChangesExport(older)).alreadyKnown).toBe(1)
  expect(await appDatabase.birds.get('bird')).toBeUndefined()
})

it('bewahrt eine lokale Löschung bei Konfliktlösung als weitergebbare Operation', async () => {
  const { importChangesExport, resolveChanges } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const origin = crypto.randomUUID()
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('birds', bird.id, bird, origin)
  const first = await createChangesExport()
  await commitJournaledChange('birds', bird.id, { ...bird, name: 'Paket' }, origin)
  const second = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  await importChangesExport(first)
  await appDatabase.birds.delete(bird.id)
  expect((await importChangesExport(second)).conflicts).toBe(1)
  const pending = (await appDatabase.devicePendingPackages.toArray())[0]
  expect(pending.conflicts[0].local).toBeNull()
  expect((await resolveChanges(pending.packageId, 'local')).applied).toBe(1)
  expect(await appDatabase.birds.get(bird.id)).toBeUndefined()
  const operations = await appDatabase.deviceOperations.toArray()
  expect(
    operations.some(
      (item) =>
        item.deviceId !== origin && item.action === 'delete' && item.before?.name === 'Paket',
    ),
  ).toBe(true)
})

it('sammelt weitere Konflikte ohne Teilimport und erhält beide Versionen', async () => {
  const { importChangesExport, resolveChanges } = await import('./importChangesExport')
  const stamp = '2026-01-01T00:00:00.000Z'
  const origin = crypto.randomUUID()
  const first = {
    id: 'first',
    name: 'Paket A',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  const second = {
    id: 'second',
    name: 'Paket B',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await commitJournaledChange('birds', first.id, first, origin)
  await commitJournaledChange('birds', second.id, second, origin)
  const archive = await createChangesExport()
  await appDatabase.delete()
  await appDatabase.open()
  await appDatabase.birds.bulkAdd([
    { ...first, name: 'Lokal A' },
    { ...second, name: 'Lokal B' },
  ])
  expect((await importChangesExport(archive)).conflicts).toBe(1)
  const pending = (await appDatabase.devicePendingPackages.toArray())[0]
  expect((await resolveChanges(pending.packageId, 'local')).conflicts).toBe(2)
  expect(await appDatabase.deviceOperations.count()).toBe(0)
  expect((await resolveChanges(pending.packageId, 'local')).applied).toBe(2)
  expect((await appDatabase.birds.get(first.id))?.name).toBe('Lokal A')
  expect((await appDatabase.birds.get(second.id))?.name).toBe('Lokal B')
  expect((await appDatabase.devicePendingPackages.get(pending.packageId))?.conflicts).toHaveLength(
    2,
  )
})
