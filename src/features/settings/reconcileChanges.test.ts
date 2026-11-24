import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { appDatabase } from '../../data/database/appDatabase'
import { commitJournaledChange } from './changeJournal'
import { captureReconciliationBaseline, reconcileChanges } from './reconcileChanges'

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
const stamp = '2026-01-01T00:00:00.000Z'
const bird = (id: string, name: string) => ({
  id,
  name,
  species: 'Wellensittich',
  createdAt: stamp,
  updatedAt: stamp,
})

it('erfasst Änderungen, Neuanlagen und Löschungen seit der Vergleichsbasis einmalig', async () => {
  await appDatabase.birds.bulkAdd([bird('changed', 'Alt'), bird('deleted', 'Weg')])
  await captureReconciliationBaseline()
  await appDatabase.birds.put(bird('changed', 'Neu'))
  await appDatabase.birds.delete('deleted')
  await appDatabase.birds.add(bird('added', 'Hinzu'))
  expect(await reconcileChanges()).toEqual({ captured: 3, initialized: false })
  const ops = await appDatabase.deviceOperations.toArray()
  expect(ops.find((item) => item.recordId === 'changed')).toMatchObject({
    before: { name: 'Alt' },
    after: { name: 'Neu' },
  })
  expect(ops.find((item) => item.recordId === 'deleted')).toMatchObject({
    before: { name: 'Weg' },
    after: null,
    action: 'delete',
  })
  expect(ops.find((item) => item.recordId === 'added')).toMatchObject({
    before: null,
    after: { name: 'Hinzu' },
  })
  expect((await reconcileChanges()).captured).toBe(0)
  expect(await appDatabase.deviceOperations.count()).toBe(3)
})

it('berücksichtigt bereits protokollierte Zwischenänderungen vor einer unprotokollierten Änderung', async () => {
  await appDatabase.birds.add(bird('a', 'Alt'))
  await captureReconciliationBaseline()
  await commitJournaledChange('birds', 'a', bird('a', 'Protokolliert'), crypto.randomUUID())
  await appDatabase.birds.put(bird('a', 'Danach'))
  expect((await reconcileChanges()).captured).toBe(1)
  const ops = await appDatabase.deviceOperations.toArray()
  expect(ops.find((op) => op.after?.name === 'Danach')?.before?.name).toBe('Protokolliert')
})

it('verwirft mehrdeutige Änderungsfolgen ohne eine Teilübernahme', async () => {
  await appDatabase.birds.add(bird('a', 'Alt'))
  await captureReconciliationBaseline()
  const base = {
    tableName: 'birds' as const,
    recordId: 'a',
    action: 'put' as const,
    before: bird('a', 'Alt'),
    sequence: 1,
    createdAt: stamp,
  }
  await appDatabase.deviceOperations.bulkAdd([
    {
      ...base,
      operationId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      after: bird('a', 'Zweig A'),
    },
    {
      ...base,
      operationId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      after: bird('a', 'Zweig B'),
    },
  ])
  await appDatabase.birds.put(bird('a', 'Lokal'))
  await expect(reconcileChanges()).rejects.toThrow(/mehrdeutig/)
  expect(await appDatabase.deviceOperations.count()).toBe(2)
  expect((await appDatabase.birds.get('a'))?.name).toBe('Lokal')
})

it('berücksichtigt eine bestätigte Übernahme der Paketversion ohne künstlichen Folgekonflikt', async () => {
  const before = bird('a', 'Lokal')
  const incoming = bird('a', 'Paket')
  const ancestor = bird('a', 'Früher')
  await appDatabase.birds.add(before)
  await captureReconciliationBaseline()
  await appDatabase.birds.put(incoming)
  await appDatabase.deviceOperations.add({
    operationId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    sequence: 1,
    tableName: 'birds',
    recordId: 'a',
    action: 'put',
    before: ancestor,
    after: incoming,
    createdAt: stamp,
  })
  await appDatabase.devicePendingPackages.add({
    packageId: crypto.randomUUID(),
    createdAt: stamp,
    resolvedAt: stamp,
    resolvedChoice: 'incoming',
    archive: new Blob(['zip']),
    conflicts: [{ table: 'birds', recordId: 'a', local: before, incoming }],
  })
  expect((await reconcileChanges()).captured).toBe(0)
  expect(await appDatabase.deviceOperations.count()).toBe(1)
})

it('erfasst Änderungen binärer Mediendateien einschließlich einer Löschung', async () => {
  const old = new Blob(['alt'], { type: 'image/png' })
  const media = {
    id: 'image',
    fileName: 'bild.png',
    mimeType: old.type,
    fileSize: old.size,
    blob: old,
    createdAt: stamp,
    updatedAt: stamp,
  }
  await appDatabase.mediaAssets.add(media)
  await captureReconciliationBaseline()
  await appDatabase.mediaAssets.delete(media.id)
  expect((await reconcileChanges()).captured).toBe(1)
  const op = (await appDatabase.deviceOperations.toArray())[0]
  expect(op.action).toBe('delete')
  expect(await (op.before?.blob as Blob).text()).toBe('alt')
})
