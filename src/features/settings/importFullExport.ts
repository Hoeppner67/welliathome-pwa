import Dexie from 'dexie'
import { appDatabase } from '../../data/database/appDatabase'
import { validateFullExport } from './validateFullExport'
import {
  activeJournalDevice,
  appendObservedOperation,
  writeCompoundRecord,
  type PersonalTable,
} from './changeJournal'

const PACKAGE_PREFIX = 'device-import-package:'
export const LAST_IMPORT_KEY = 'device-import-last-successful-at'
const TABLES = [
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
] as const

type Row = Record<string, unknown> & { id: string }
export interface ImportConflict {
  table: string
  recordId: string
  local: Row | null
  incoming: Row | null
  operationId?: string
}
export interface PendingPackage {
  packageId: string
  createdAt: string
  archive: Blob
  conflicts: ImportConflict[]
  resolvedAt?: string
  resolvedChoice?: 'local' | 'incoming'
  kind?: 'changes' | 'snapshot'
}
export interface FullImportPreview {
  additions: number
  conflicts: number
  alreadyImported?: boolean
}
class FullPreviewComplete extends Error {
  constructor(readonly result: FullImportPreview) {
    super('Vorschau abgeschlossen')
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
export async function sameRow(local: Row, incoming: Row): Promise<boolean> {
  const { blob: localBlob, ...localFields } = local
  const { blob: incomingBlob, ...incomingFields } = incoming
  if (canonical(localFields) !== canonical(incomingFields)) return false
  if (localBlob === undefined && incomingBlob === undefined) return true
  if (
    !(localBlob instanceof Blob) ||
    !(incomingBlob instanceof Blob) ||
    localBlob.type !== incomingBlob.type ||
    localBlob.size !== incomingBlob.size
  )
    return false
  const [a, b] = await Dexie.waitFor(
    Promise.all([localBlob.arrayBuffer(), incomingBlob.arrayBuffer()]),
  )
  const right = new Uint8Array(b)
  return new Uint8Array(a).every((byte, index) => byte === right[index])
}

/** Merge new records conservatively; any conflicting record aborts the whole transaction. */
async function processFullExport(
  file: Blob,
  resolution: 'local' | 'incoming' | null,
  preview = false,
): Promise<'imported' | 'already-imported' | 'conflicts'> {
  const snapshot = await validateFullExport(file)
  const fileHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
  const tables = TABLES.map((name) => appDatabase.table(name))
  const device = preview ? null : activeJournalDevice()
  return appDatabase.transaction(
    'rw',
    [
      ...tables,
      appDatabase.appMetadata,
      appDatabase.devicePendingPackages,
      appDatabase.deviceOperations,
    ],
    async () => {
      const marker = `${PACKAGE_PREFIX}${snapshot.packageId}`
      if (await appDatabase.appMetadata.get(`device-change-package:${snapshot.packageId}`)) {
        throw new Error('Eine Paketkennung wurde bereits für ein Änderungspaket verwendet.')
      }
      const hashMarker = `${marker}:sha256`
      const knownHash = await appDatabase.appMetadata.get(hashMarker)
      if (knownHash && knownHash.value !== fileHash)
        throw new Error('Eine Paketkennung wurde mit anderem Inhalt wiederverwendet.')
      if (await appDatabase.appMetadata.get(marker)) {
        if (preview)
          throw new FullPreviewComplete({ additions: 0, conflicts: 0, alreadyImported: true })
        return 'already-imported'
      }
      const saved = await appDatabase.devicePendingPackages.get(snapshot.packageId)
      if (saved) {
        if (saved.kind === 'changes')
          throw new Error('Eine Paketkennung wurde mit anderem Inhalt wiederverwendet.')
        const savedHash = await Dexie.waitFor(
          saved.archive
            .arrayBuffer()
            .then((buffer) => crypto.subtle.digest('SHA-256', buffer))
            .then((digest) =>
              Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
                '',
              ),
            ),
        )
        if (savedHash !== fileHash)
          throw new Error('Eine Paketkennung wurde mit anderem Inhalt wiederverwendet.')
      }
      if (saved && !resolution) {
        if (preview)
          throw new FullPreviewComplete({ additions: 0, conflicts: saved.conflicts.length })
        return 'conflicts'
      }
      if (resolution && (!saved || saved.resolvedAt))
        throw new Error('Das Konfliktpaket ist nicht mehr offen.')
      const additions = new Map<string, Row[]>()
      const conflicts: ImportConflict[] = []
      for (const table of tables) {
        const pending: Row[] = []
        for (const row of snapshot.data[table.name]) {
          const existing = (await table.get(row.id)) as Row | undefined
          if (existing) {
            if (!(await sameRow(existing, row)))
              conflicts.push({
                table: table.name,
                recordId: row.id,
                local: existing,
                incoming: row,
              })
            continue
          }
          if (table.name === 'favorites') {
            const favorite = (await table
              .where('[itemType+itemId]')
              .equals([row.itemType as string, row.itemId as string])
              .first()) as Row | undefined
            if (favorite) {
              conflicts.push({
                table: table.name,
                recordId: row.id,
                local: favorite,
                incoming: row,
              })
              continue
            }
          }
          pending.push(row)
        }
        additions.set(table.name, pending)
      }
      if (resolution && saved) {
        if (conflicts.length !== saved.conflicts.length)
          throw new Error('Die Konflikte haben sich geändert. Es wurden keine Daten verändert.')
        for (const conflict of conflicts) {
          const original = saved.conflicts.find(
            (item) => item.table === conflict.table && item.recordId === conflict.recordId,
          )
          if (
            !original ||
            !original.local ||
            !original.incoming ||
            !conflict.local ||
            !conflict.incoming ||
            !(await sameRow(original.local, conflict.local)) ||
            !(await sameRow(original.incoming, conflict.incoming))
          ) {
            throw new Error(
              'Ein Konflikt hat sich seit der Prüfung geändert. Es wurden keine Daten verändert.',
            )
          }
        }
      }
      if (conflicts.length && !resolution) {
        if (preview)
          throw new FullPreviewComplete({
            additions: [...additions.values()].reduce((total, rows) => total + rows.length, 0),
            conflicts: conflicts.length,
          })
        if (!(await appDatabase.devicePendingPackages.get(snapshot.packageId))) {
          await appDatabase.devicePendingPackages.add({
            packageId: snapshot.packageId,
            createdAt: new Date().toISOString(),
            archive: file,
            conflicts,
          })
        }
        return 'conflicts'
      }
      for (const archive of snapshot.archives) {
        const existing = await appDatabase.devicePendingPackages.get(archive.packageId)
        if (!existing) {
          await appDatabase.devicePendingPackages.add(archive)
          continue
        }
        const [a, b] = await Dexie.waitFor(
          Promise.all([existing.archive.arrayBuffer(), archive.archive.arrayBuffer()]),
        )
        const right = new Uint8Array(b)
        if (
          a.byteLength !== b.byteLength ||
          !new Uint8Array(a).every((byte, index) => byte === right[index]) ||
          (existing.kind !== archive.kind &&
            !(existing.kind === undefined && archive.kind === 'snapshot')) ||
          existing.createdAt !== archive.createdAt ||
          existing.resolvedAt !== archive.resolvedAt ||
          existing.resolvedChoice !== archive.resolvedChoice ||
          existing.conflicts.length !== archive.conflicts.length
        )
          throw new Error(
            'Ein Konfliktarchiv mit derselben Kennung unterscheidet sich. Es wurden keine Daten verändert.',
          )
        for (let i = 0; i < existing.conflicts.length; i++) {
          const left = existing.conflicts[i],
            right = archive.conflicts[i]
          if (
            left.table !== right.table ||
            left.recordId !== right.recordId ||
            left.operationId !== right.operationId ||
            (left.local === null) !== (right.local === null) ||
            (left.incoming === null) !== (right.incoming === null) ||
            (left.local && right.local && !(await sameRow(left.local, right.local))) ||
            (left.incoming && right.incoming && !(await sameRow(left.incoming, right.incoming)))
          )
            throw new Error(
              'Ein Konfliktarchiv mit derselben Kennung unterscheidet sich. Es wurden keine Daten verändert.',
            )
        }
      }
      for (const table of tables) {
        const rows = additions.get(table.name)!
        if (device) {
          for (const row of rows)
            await writeCompoundRecord(table.name as PersonalTable, row.id, row, device, true)
        } else await table.bulkAdd(rows)
      }
      if (resolution === 'incoming') {
        for (const conflict of conflicts) {
          if (!conflict.local || !conflict.incoming) throw new Error('Ungültiger Konflikt.')
          // Favorites have a unique logical key and may have different local IDs.
          const incoming =
            conflict.table === 'favorites'
              ? { ...conflict.incoming, id: conflict.local.id }
              : conflict.incoming
          await writeCompoundRecord(conflict.table as PersonalTable, incoming.id, incoming, device)
        }
      }
      if (resolution === 'local' && device) {
        for (const conflict of conflicts) {
          if (!conflict.local || !conflict.incoming) throw new Error('Ungültiger Konflikt.')
          const incoming =
            conflict.table === 'favorites'
              ? { ...conflict.incoming, id: conflict.local.id }
              : conflict.incoming
          await appendObservedOperation(
            conflict.table as PersonalTable,
            conflict.local.id,
            incoming,
            conflict.local,
            device,
          )
        }
      }
      // Validate the combined graph after all choices, still inside the transaction.
      const birds = await appDatabase.birds.toArray()
      const media = await appDatabase.mediaAssets.toArray()
      const birdIds = new Set(birds.map((bird) => bird.id))
      const mediaById = new Map(media.map((item) => [item.id, item]))
      for (const bird of birds) {
        if (bird.imageId) {
          const item = mediaById.get(bird.imageId)
          if (!item || (item.relatedType === 'bird-profile' && item.relatedId !== bird.id))
            throw new Error(
              'Die gewählte Zusammenführung würde einen ungültigen Bildverweis erzeugen.',
            )
        }
      }
      for (const item of media) {
        if (
          item.relatedType === 'bird-profile' &&
          (!item.relatedId || !birdIds.has(item.relatedId))
        )
          throw new Error(
            'Die gewählte Zusammenführung würde einen ungültigen Medienverweis erzeugen.',
          )
      }
      for (const name of [
        'medications',
        'weights',
        'observations',
        'healthEvents',
        'vetAppointments',
        'reminders',
      ]) {
        const rows = (await appDatabase.table(name).toArray()) as Row[]
        if (
          rows.some(
            (row) => row.birdId && (typeof row.birdId !== 'string' || !birdIds.has(row.birdId)),
          )
        )
          throw new Error(
            'Die gewählte Zusammenführung würde einen ungültigen Vogelverweis erzeugen.',
          )
      }
      if (snapshot.initialization) await appDatabase.appMetadata.put(snapshot.initialization)
      if (preview)
        throw new FullPreviewComplete({
          additions: [...additions.values()].reduce((total, rows) => total + rows.length, 0),
          conflicts: 0,
        })
      const now = new Date().toISOString()
      await appDatabase.appMetadata.put({ id: marker, value: now })
      await appDatabase.appMetadata.put({ id: hashMarker, value: fileHash })
      await appDatabase.appMetadata.put({ id: LAST_IMPORT_KEY, value: now })
      if (resolution && saved)
        await appDatabase.devicePendingPackages.put({
          ...saved,
          resolvedAt: now,
          resolvedChoice: resolution,
        })
      return 'imported'
    },
  )
}

/** Run a complete merge in a transaction that is rolled back before returning. */
export async function previewFullExport(file: Blob): Promise<FullImportPreview> {
  try {
    await processFullExport(file, null, true)
  } catch (error) {
    if (error instanceof FullPreviewComplete) return error.result
    throw error
  }
  throw new Error('Die Vorschau konnte nicht erstellt werden.')
}

export function importFullExport(
  file: Blob,
): Promise<'imported' | 'already-imported' | 'conflicts'> {
  return processFullExport(file, null)
}

/** Keep current versions and retain the complete conflict archive locally. */
export async function resolveKeepingLocal(packageId: string): Promise<void> {
  const saved = await appDatabase.devicePendingPackages.get(packageId)
  if (!saved || saved.resolvedAt) throw new Error('Das Konfliktpaket ist nicht mehr offen.')
  const result = await processFullExport(saved.archive, 'local')
  if (result !== 'imported') throw new Error('Das Konfliktpaket konnte nicht abgeschlossen werden.')
}

/** Activate package versions while retaining both original versions in the conflict archive. */
export async function resolveUsingIncoming(packageId: string): Promise<void> {
  const saved = await appDatabase.devicePendingPackages.get(packageId)
  if (!saved || saved.resolvedAt) throw new Error('Das Konfliktpaket ist nicht mehr offen.')
  const result = await processFullExport(saved.archive, 'incoming')
  if (result !== 'imported') throw new Error('Das Konfliktpaket konnte nicht abgeschlossen werden.')
}
