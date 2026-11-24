import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { appDatabase } from '../../data/database/appDatabase'
import { createFullExport } from './fullExport'
import { importFullExport } from './importFullExport'
import { importChangesExport } from './importChangesExport'

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
  vi.unstubAllGlobals()
})

it('verwirft tatsächlich über 100 MB entpackte ZIP-Daten vor einer Änderung der lokalen Daten', async () => {
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'local',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await appDatabase.birds.add(bird)
  const oversized = new Uint8Array(100 * 1024 * 1024 + 1)
  for (const [name, importFile] of [
    ['full', importFullExport],
    ['changes', importChangesExport],
  ] as const) {
    const entries: Record<string, Uint8Array> = { 'manifest.json': strToU8('{}') }
    entries[name === 'full' ? 'data.json' : 'operations.json'] = strToU8('{}')
    entries[name === 'full' ? 'media/0' : 'media/0-after'] = oversized
    const archive = new Blob([zipSync(entries, { level: 6 }) as Uint8Array<ArrayBuffer>])
    expect(archive.size).toBeLessThan(100 * 1024 * 1024)
    await expect(importFile(archive)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/Größenlimit/) }),
    })
    expect(await appDatabase.birds.get(bird.id)).toEqual(bird)
    expect(await appDatabase.deviceOperations.count()).toBe(0)
    expect(await appDatabase.devicePendingPackages.count()).toBe(0)
  }
}, 60000)

it('verwirft ZIP-Dateien mit mehr als 10002 Einträgen ohne Datenänderung', async () => {
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'local',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await appDatabase.birds.add(bird)
  for (const [name, importFile] of [
    ['full', importFullExport],
    ['changes', importChangesExport],
  ] as const) {
    const entries: Record<string, Uint8Array> = { 'manifest.json': strToU8('{}') }
    entries[name === 'full' ? 'data.json' : 'operations.json'] = strToU8('{}')
    for (let index = 0; index < 10001; index++)
      entries[name === 'full' ? `media/${index}` : `media/${index}-after`] = new Uint8Array()
    const archive = new Blob([zipSync(entries, { level: 0 }) as Uint8Array<ArrayBuffer>])
    await expect(importFile(archive)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/Datei/) }),
    })
    expect(await appDatabase.birds.get(bird.id)).toEqual(bird)
    expect(await appDatabase.deviceOperations.count()).toBe(0)
    expect(await appDatabase.devicePendingPackages.count()).toBe(0)
  }
}, 60000)

it('exportiert und importiert ein Medium nahe der 100-MB-Grenze', async () => {
  const stamp = '2026-01-01T00:00:00.000Z'
  const bytes = new Uint8Array(99 * 1024 * 1024)
  for (let offset = 0; offset < bytes.length; offset += 65536)
    crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65536, bytes.length)))
  bytes[0] = 7
  bytes[bytes.length - 1] = 9
  const blob = new Blob([bytes], { type: 'application/pdf' })
  await appDatabase.mediaAssets.add({
    id: 'large',
    fileName: 'dokument.pdf',
    mimeType: blob.type,
    fileSize: blob.size,
    blob,
    createdAt: stamp,
    updatedAt: stamp,
  })
  const archive = await createFullExport()
  expect(archive.size).toBeGreaterThan(98 * 1024 * 1024)
  expect(archive.size).toBeLessThan(100 * 1024 * 1024)
  await appDatabase.mediaAssets.clear()
  expect(await importFullExport(archive)).toBe('imported')
  const restored = await appDatabase.mediaAssets.get('large')
  const content = new Uint8Array(await restored!.blob.arrayBuffer())
  expect(content.length).toBe(bytes.length)
  expect(content[0]).toBe(7)
  expect(content[content.length - 1]).toBe(9)
  expect(new Uint8Array(await crypto.subtle.digest('SHA-256', content))).toEqual(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  )
}, 120000)
