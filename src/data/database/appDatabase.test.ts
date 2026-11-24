// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
// The application tsconfig excludes Node types; the test runner supplies this built-in.
// @ts-expect-error Node built-ins are only used by this test.
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, expect, it } from 'vitest'
import { appDatabase, initializeDatabase } from './appDatabase'
import { DATABASE_VERSIONS } from './schema'

afterEach(() => appDatabase.delete())

it.each([1, 2, 3, 4, 5, 6, 7, 8] as const)(
  'erhält persönliche Daten beim Upgrade von Schema %i',
  async (version) => {
    const legacy = new Dexie(appDatabase.name)
    legacy.version(version).stores(DATABASE_VERSIONS[version])
    const stamp = '2026-11-20T10:00:00.000Z'
    const record = { createdAt: stamp, updatedAt: stamp }
    const birdId = 'pico'
    const personal = {
      birds: { ...record, id: birdId, name: 'Pico', species: 'Wellensittich' },
      weights: { ...record, id: 'weight', birdId, weight: 41, date: '2026-11-20' },
      medications: {
        ...record,
        id: 'medication',
        birdId,
        name: 'Beispiel',
        startDate: '2026-11-20',
      },
      observations: { ...record, id: 'event', birdId, date: '2026-11-20', category: 'Verhalten' },
      healthEvents: {
        ...record,
        id: 'health',
        birdId,
        date: '2026-11-20',
        title: 'Kontrolle',
        description: 'Unauffällig',
      },
      vetAppointments: { ...record, id: 'vet', birdId, date: '2026-11-20', title: 'Termin' },
      reminders: {
        ...record,
        id: 'reminder',
        birdId,
        dueDate: '2026-11-20',
        title: 'Kontrolle',
        reminderType: 'other',
        completed: false,
      },
      mediaAssets: {
        ...record,
        id: 'image',
        relatedType: 'bird-profile',
        relatedId: birdId,
        fileName: 'bild.png',
        mimeType: 'image/png',
        fileSize: 4,
        blob: new NodeBlob(['bild'], { type: 'image/png' }),
      },
      feedMixes: {
        ...record,
        id: 'mix',
        name: 'Primus Basis',
        ingredients: ['Hirse'],
        notes: 'Welli@Home10',
      },
      favorites: { ...record, id: 'favorite', itemType: 'wiki-article', itemId: '42' },
    }
    try {
      await legacy.open()
      for (const [table, row] of Object.entries(personal)) await legacy.table(table).add(row)
      if (version >= 2) {
        await legacy.table('wikiArticles').add({
          ...record,
          id: '42',
          excerptHtml: '<p>Einleitung</p>',
          contentHtml: '<p>Gespeicherter Artikel</p>',
          ...(version >= 5 ? { searchText: 'Gespeicherter Artikel' } : {}),
        })
      }
      if (version === 5) {
        await legacy.table('syncState').add({
          id: 'syncSettings',
          value: { enabled: true, provider: 'pcloud' },
          updatedAt: stamp,
        })
      }
      if (version >= 7)
        await legacy.table('devicePendingPackages').add({
          packageId: 'package',
          createdAt: stamp,
          archive: new NodeBlob(['archiv']),
          conflicts: [],
        })
      if (version >= 8)
        await legacy.table('deviceOperations').add({
          operationId: 'operation',
          deviceId: 'device',
          sequence: 1,
          tableName: 'birds',
          recordId: birdId,
          action: 'put',
          before: null,
          after: personal.birds,
          createdAt: stamp,
        })
    } finally {
      legacy.close()
    }

    const db = await initializeDatabase()
    expect(db.verno).toBe(9)
    for (const [table, row] of Object.entries(personal)) {
      expect(await db.table(table).get(row.id)).toEqual(row)
    }
    expect(await (await db.mediaAssets.get('image'))!.blob.text()).toBe('bild')
    if (version >= 2) {
      expect((await db.wikiArticles.get('42'))?.searchText).toContain('Gespeicherter Artikel')
    }
    expect(db.tables.map((table) => table.name)).not.toContain('syncState')
    expect(db.tables.map((table) => table.name)).not.toContain('syncOperations')
    expect(db.tables.map((table) => table.name)).toContain('contentSyncStatus')
    if (version >= 7)
      expect(await (await db.devicePendingPackages.get('package'))!.archive.text()).toBe('archiv')
    if (version >= 8)
      expect((await db.deviceOperations.get('operation'))?.after).toEqual(personal.birds)
  },
)
