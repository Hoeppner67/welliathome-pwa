import { expect, it } from 'vitest'
import { AppDatabase } from '../../data/database/appDatabase'
import { mutateJournaledRecord } from './changeJournal'
import { createChangesExport } from './changesExport'
import { importChangesExports, resolveChanges } from './importChangesExport'

it('tauscht unabhängige Änderungen zwischen drei Datenbanken idempotent aus', async () => {
  const databases = Array.from(
    { length: 3 },
    () => new AppDatabase(`sync-test-${crypto.randomUUID()}`),
  )
  const [a, b, c] = databases
  const [idA, idB, idC] = Array.from({ length: 3 }, () => crypto.randomUUID())
  const stamp = '2026-01-01T00:00:00.000Z'
  try {
    await Promise.all(databases.map((db) => db.open()))
    await mutateJournaledRecord(
      'birds',
      'bird',
      idA,
      () => ({
        id: 'bird',
        name: 'Pico',
        species: 'Wellensittich',
        createdAt: stamp,
        updatedAt: stamp,
      }),
      a,
    )
    const initial = await createChangesExport(a, idA)
    expect((await importChangesExports([initial], b, idB)).applied).toBe(1)
    await mutateJournaledRecord(
      'weights',
      'weight',
      idB,
      () => ({
        id: 'weight',
        birdId: 'bird',
        weight: 40,
        date: '2026-01-01',
        createdAt: stamp,
        updatedAt: stamp,
      }),
      b,
    )
    await mutateJournaledRecord(
      'observations',
      'observation',
      idA,
      () => ({
        id: 'observation',
        birdId: 'bird',
        description: 'Frisst gut',
        date: '2026-01-01',
        createdAt: stamp,
        updatedAt: stamp,
      }),
      a,
    )
    const fromA = await createChangesExport(a, idA)
    const fromB = await createChangesExport(b, idB)
    await importChangesExports([fromB], a, idA)
    await importChangesExports([fromA], b, idB)
    await importChangesExports([fromB, fromA], c, idC)
    for (const db of databases) {
      expect(await db.birds.count()).toBe(1)
      expect(await db.weights.count()).toBe(1)
      expect(await db.observations.count()).toBe(1)
      expect(await db.deviceOperations.count()).toBe(3)
    }
    expect((await importChangesExports([fromA, fromB], c, idC)).alreadyKnown).toBe(3)
  } finally {
    await Promise.all(databases.map((db) => db.delete()))
  }
})

it('archiviert konkurrierende Versionen und exportiert die Entscheidung', async () => {
  const databases = Array.from(
    { length: 3 },
    () => new AppDatabase(`sync-test-${crypto.randomUUID()}`),
  )
  const [a, b, c] = databases
  const [idA, idB, idC] = Array.from({ length: 3 }, () => crypto.randomUUID())
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  try {
    await Promise.all(databases.map((db) => db.open()))
    await mutateJournaledRecord('birds', 'bird', idA, () => bird, a)
    const initial = await createChangesExport(a, idA)
    await importChangesExports([initial], b, idB)
    await importChangesExports([initial], c, idC)
    await mutateJournaledRecord('birds', 'bird', idA, () => ({ ...bird, name: 'A' }), a)
    await mutateJournaledRecord('birds', 'bird', idB, () => ({ ...bird, name: 'B' }), b)
    const fromB = await createChangesExport(b, idB)
    expect((await importChangesExports([fromB], a, idA)).conflicts).toBe(1)
    const pending = (await a.devicePendingPackages.toArray())[0]
    expect(pending.conflicts[0].local?.name).toBe('A')
    expect(pending.conflicts[0].incoming?.name).toBe('B')
    await resolveChanges(pending.packageId, 'local', a, idA)
    expect((await a.birds.get('bird'))?.name).toBe('A')
    const exported = await createChangesExport(a, idA)
    const { validateChangesExport } = await import('./validateChangesExport')
    const operations = (await validateChangesExport(exported)).operations
    expect(
      operations.some(
        (operation) => operation.before?.name === 'B' && operation.after?.name === 'A',
      ),
    ).toBe(true)
    expect((await a.devicePendingPackages.get(pending.packageId))?.resolvedAt).toBeTruthy()
  } finally {
    await Promise.all(databases.map((db) => db.delete()))
  }
})

it('bricht bei fehlender Vorgängeroperation ohne Teilübernahme ab', async () => {
  const source = new AppDatabase(`sync-test-${crypto.randomUUID()}`)
  const target = new AppDatabase(`sync-test-${crypto.randomUUID()}`)
  const sourceId = crypto.randomUUID(),
    targetId = crypto.randomUUID()
  const stamp = '2026-01-01T00:00:00.000Z'
  const bird = {
    id: 'bird',
    name: 'Pico',
    species: 'Wellensittich',
    createdAt: stamp,
    updatedAt: stamp,
  }
  try {
    await Promise.all([source.open(), target.open()])
    const first = await mutateJournaledRecord('birds', 'bird', sourceId, () => bird, source)
    await mutateJournaledRecord(
      'birds',
      'bird',
      sourceId,
      () => ({ ...bird, name: 'Luna' }),
      source,
    )
    await source.deviceOperations.delete(first!.operationId)
    const incomplete = await createChangesExport(source, sourceId)
    const existing = { ...bird, id: 'existing' }
    await target.birds.add(existing)
    await expect(importChangesExports([incomplete], target, targetId)).rejects.toThrow(/Lücke/)
    expect(await target.birds.toArray()).toEqual([existing])
    expect(await target.deviceOperations.count()).toBe(0)
    expect(await target.appMetadata.count()).toBe(0)
  } finally {
    await Promise.all([source.delete(), target.delete()])
  }
})

it.each(['local', 'incoming'] as const)(
  'bewahrt unabhängige Änderungen auf Gerät C bei weitergereichter Konfliktentscheidung (%s)',
  async (choice) => {
    const databases = Array.from(
      { length: 3 },
      () => new AppDatabase(`sync-test-${crypto.randomUUID()}`),
    )
    const [a, b, c] = databases
    const [idA, idB, idC] = Array.from({ length: 3 }, () => crypto.randomUUID())
    const stamp = '2026-01-01T00:00:00.000Z'
    const bird = {
      id: 'bird',
      name: 'Pico',
      species: 'Wellensittich',
      createdAt: stamp,
      updatedAt: stamp,
    }
    try {
      await Promise.all(databases.map((db) => db.open()))
      await mutateJournaledRecord('birds', bird.id, idA, () => bird, a)
      const initial = await createChangesExport(a, idA)
      await importChangesExports([initial], b, idB)
      await importChangesExports([initial], c, idC)
      await mutateJournaledRecord('birds', bird.id, idA, () => ({ ...bird, name: 'A' }), a)
      await mutateJournaledRecord('birds', bird.id, idB, () => ({ ...bird, name: 'B' }), b)
      await mutateJournaledRecord('birds', bird.id, idC, () => ({ ...bird, name: 'C' }), c)
      expect(
        (await importChangesExports([await createChangesExport(b, idB)], a, idA)).conflicts,
      ).toBe(1)
      const conflict = (await a.devicePendingPackages.toArray())[0]
      await resolveChanges(conflict.packageId, choice, a, idA)
      const forwarded = await createChangesExport(a, idA)
      const operationsBefore = await c.deviceOperations.toArray()
      expect((await importChangesExports([forwarded], c, idC)).conflicts).toBe(1)
      expect((await c.birds.get(bird.id))?.name).toBe('C')
      expect(await c.deviceOperations.toArray()).toEqual(operationsBefore)
      expect((await importChangesExports([forwarded], c, idC)).conflicts).toBe(1)
      expect(await c.devicePendingPackages.count()).toBe(1)
      expect((await c.birds.get(bird.id))?.name).toBe('C')
    } finally {
      await Promise.all(databases.map((db) => db.delete()))
    }
  },
)

it.each(['local', 'incoming'] as const)(
  'bewahrt Gerät C bei weitergereichter Entscheidung über eine Löschung (%s)',
  async (choice) => {
    const databases = Array.from(
      { length: 3 },
      () => new AppDatabase(`sync-test-${crypto.randomUUID()}`),
    )
    const [a, b, c] = databases
    const [idA, idB, idC] = Array.from({ length: 3 }, () => crypto.randomUUID())
    const stamp = '2026-01-01T00:00:00.000Z'
    const bird = {
      id: 'bird',
      name: 'Pico',
      species: 'Wellensittich',
      createdAt: stamp,
      updatedAt: stamp,
    }
    try {
      await Promise.all(databases.map((db) => db.open()))
      await mutateJournaledRecord('birds', bird.id, idA, () => bird, a)
      const initial = await createChangesExport(a, idA)
      await importChangesExports([initial], b, idB)
      await importChangesExports([initial], c, idC)
      await mutateJournaledRecord('birds', bird.id, idA, () => ({ ...bird, name: 'A' }), a)
      await mutateJournaledRecord('birds', bird.id, idB, () => null, b)
      await mutateJournaledRecord('birds', bird.id, idC, () => ({ ...bird, name: 'C' }), c)
      expect(
        (await importChangesExports([await createChangesExport(b, idB)], a, idA)).conflicts,
      ).toBe(1)
      const conflict = (await a.devicePendingPackages.toArray())[0]
      await resolveChanges(conflict.packageId, choice, a, idA)
      const forwarded = await createChangesExport(a, idA)
      const operationsBefore = await c.deviceOperations.toArray()
      expect((await importChangesExports([forwarded], c, idC)).conflicts).toBe(1)
      expect((await c.birds.get(bird.id))?.name).toBe('C')
      expect(await c.deviceOperations.toArray()).toEqual(operationsBefore)
    } finally {
      await Promise.all(databases.map((db) => db.delete()))
    }
  },
)

it(
  'überträgt eine Konfliktentscheidung ohne erneuten Konflikt an ein drittes Gerät',
  async () => {
    const databases = Array.from(
      { length: 3 },
      () => new AppDatabase(`sync-test-${crypto.randomUUID()}`),
    )
    const [a, b, c] = databases
    const [idA, idB, idC] = Array.from({ length: 3 }, () => crypto.randomUUID())
    const stamp = '2026-01-01T00:00:00.000Z'
    const bird = {
      id: 'bird',
      name: 'Pico',
      species: 'Wellensittich',
      createdAt: stamp,
      updatedAt: stamp,
    }
    try {
      await Promise.all(databases.map((db) => db.open()))
      await mutateJournaledRecord('birds', 'bird', idA, () => bird, a)
      const initial = await createChangesExport(a, idA)
      await importChangesExports([initial], b, idB)
      await importChangesExports([initial], c, idC)
      await mutateJournaledRecord('birds', 'bird', idA, () => ({ ...bird, name: 'A' }), a)
      await mutateJournaledRecord('birds', 'bird', idB, () => ({ ...bird, name: 'B' }), b)
      await importChangesExports([await createChangesExport(b, idB)], a, idA)
      const pending = (await a.devicePendingPackages.toArray())[0]
      await resolveChanges(pending.packageId, 'local', a, idA)
      const result = await importChangesExports([await createChangesExport(a, idA)], c, idC)
      expect(result.conflicts).toBeUndefined()
      expect((await c.birds.get('bird'))?.name).toBe('A')
    } finally {
      await Promise.all(databases.map((db) => db.delete()))
    }
  },
)
