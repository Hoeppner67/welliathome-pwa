import Dexie from 'dexie'
import { appDatabase, type AppDatabase } from '../../data/database/appDatabase'
import {
  PERSONAL_TABLES,
  appendObservedOperation,
  mutateJournaledRecord,
  type DeviceOperation,
} from './changeJournal'
import { deviceId } from './fullExport'
import { sameRow, type ImportConflict } from './importFullExport'
import { validateChangesExport } from './validateChangesExport'

type Row = Record<string, unknown> & { id: string }
async function equalRow(a: Row | null, b: Row | null): Promise<boolean> {
  return a === null || b === null ? a === b : sameRow(a, b)
}
async function equalOperation(a: DeviceOperation, b: DeviceOperation): Promise<boolean> {
  return (
    a.operationId === b.operationId &&
    a.deviceId === b.deviceId &&
    a.sequence === b.sequence &&
    a.tableName === b.tableName &&
    a.recordId === b.recordId &&
    a.action === b.action &&
    a.createdAt === b.createdAt &&
    (await equalRow(a.before, b.before)) &&
    (await equalRow(a.after, b.after)) &&
    a.resolutionParents?.[0] === b.resolutionParents?.[0] &&
    a.resolutionParents?.[1] === b.resolutionParents?.[1]
  )
}

class PendingChangesConflict extends Error {
  constructor(readonly conflict: ImportConflict) {
    super('Das Änderungspaket enthält einen Konflikt.')
  }
}
type ChangesResult = { applied: number; alreadyKnown: number; conflicts?: number }
class PreviewComplete extends Error {
  constructor(readonly result: ChangesResult) {
    super('Vorschau abgeschlossen')
  }
}
/** Apply a validated, conflict-free package in one transaction; no database replacement. */
async function processChanges(
  files: Blob[],
  resolution: 'local' | 'incoming' | null,
  preview = false,
  database: AppDatabase = appDatabase,
  localDeviceId?: string,
): Promise<ChangesResult> {
  if (
    !files.length ||
    files.length > 20 ||
    files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024
  )
    throw new Error('Bitte höchstens 20 ZIP-Dateien mit zusammen maximal 100 MB auswählen.')
  const packages: Array<{ file: Blob; packageId: string; fileHash: string }> = []
  const uniqueOperations = new Map<string, DeviceOperation>()
  let expandedBytes = 0
  let entryCount = 0
  for (const file of files) {
    const parsed = await validateChangesExport(file)
    expandedBytes += parsed.expandedBytes
    entryCount += parsed.entryCount
    if (expandedBytes > 100 * 1024 * 1024)
      throw new Error('Die entpackten Änderungspakete überschreiten zusammen 100 MB.')
    if (entryCount > 10002)
      throw new Error('Die Änderungspakete enthalten zusammen zu viele Dateien.')
    const fileHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('')
    const previous = packages.find((item) => item.packageId === parsed.packageId)
    if (previous && previous.fileHash !== fileHash)
      throw new Error('Eine Paketkennung wurde mit anderem Inhalt wiederverwendet.')
    if (!previous) packages.push({ file, packageId: parsed.packageId, fileHash })
    for (const operation of parsed.operations) {
      const existing = uniqueOperations.get(operation.operationId)
      if (existing && !(await equalOperation(existing, operation)))
        throw new Error('Eine Operationskennung wurde mit anderem Inhalt wiederverwendet.')
      if (!existing) uniqueOperations.set(operation.operationId, operation)
    }
  }
  const operations = [...uniqueOperations.values()]
  const { file, packageId, fileHash } = packages[0]
  const tables = PERSONAL_TABLES.map((name) => database.table(name))
  const pendingPackages = await Promise.all(
    packages.map((item) => database.devicePendingPackages.get(item.packageId)),
  )
  for (const [index, item] of pendingPackages.entries()) {
    if (!item) continue
    const oldHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', await item.archive.arrayBuffer())),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('')
    if (item.kind !== 'changes' || oldHash !== packages[index].fileHash)
      throw new Error('Eine Paketkennung wurde mit anderem Inhalt wiederverwendet.')
    if (packages.length > 1 && !item.resolvedAt)
      throw new Error('Ein Paket enthält offene Konflikte. Bitte dieses Paket einzeln bearbeiten.')
  }
  const pending = pendingPackages[0]
  if (pending) {
    const oldHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', await pending.archive.arrayBuffer())),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('')
    if (pending.kind !== 'changes' || oldHash !== fileHash)
      throw new Error('Eine Paketkennung wurde mit anderem Inhalt wiederverwendet.')
    if (!resolution && !pending.resolvedAt)
      return { applied: 0, alreadyKnown: 0, conflicts: pending.conflicts.length }
  }
  if (resolution && (!pending || pending.resolvedAt))
    throw new Error('Das Konfliktpaket ist nicht mehr offen.')
  const localDevice = localDeviceId ?? deviceId()
  try {
    return await database.transaction(
      'rw',
      [...tables, database.deviceOperations, database.appMetadata, database.devicePendingPackages],
      async () => {
        for (const item of packages) {
          if (await database.appMetadata.get(`device-import-package:${item.packageId}`))
            throw new Error(
              'Eine Paketkennung wurde bereits für einen vollständigen Datenbestand verwendet.',
            )
          const knownPackage = await database.appMetadata.get(
            `device-change-package:${item.packageId}`,
          )
          if (knownPackage && knownPackage.value !== item.fileHash)
            throw new Error('Eine Paketkennung wurde mit anderem Inhalt wiederverwendet.')
        }
        // Imported operations may originate from this same browser after its database was reset.
        // Reserve those sequence numbers before any locally generated conflict resolution.
        const sequenceKey = `device-operation-sequence:${localDevice}`
        const sequenceEntry = await database.appMetadata.get(sequenceKey)
        const currentSequence = sequenceEntry ? Number(sequenceEntry.value) : 0
        if (!Number.isSafeInteger(currentSequence) || currentSequence < 0)
          throw new Error('Der Zähler des Änderungsprotokolls ist ungültig.')
        const importedSequence = operations
          .filter((item) => item.deviceId === localDevice)
          .reduce((max, item) => Math.max(max, item.sequence), currentSequence)
        if (importedSequence > currentSequence)
          await database.appMetadata.put({ id: sequenceKey, value: String(importedSequence) })
        const remaining: DeviceOperation[] = []
        let known = 0
        for (const operation of operations) {
          const existing = await database.deviceOperations.get(operation.operationId)
          if (existing) {
            if (!(await equalOperation(existing, operation)))
              throw new Error('Eine Operationskennung wurde mit anderem Inhalt wiederverwendet.')
            known++
            continue
          }
          const sameSequence = await database.deviceOperations
            .where('deviceId')
            .equals(operation.deviceId)
            .filter((item) => item.sequence === operation.sequence)
            .first()
          if (sameSequence)
            throw new Error('Eine Operationssequenz wurde mit anderer Kennung wiederverwendet.')
          remaining.push(operation)
        }
        // A later operation must never be accepted while an earlier operation from the
        // same device is missing; otherwise an old package could resurrect a deletion.
        const origins = new Set(operations.map((item) => item.deviceId))
        for (const origin of origins) {
          const retained = await database.deviceOperations
            .where('deviceId')
            .equals(origin)
            .toArray()
          const bySequence = new Map<number, string>()
          for (const operation of [
            ...retained,
            ...operations.filter((item) => item.deviceId === origin),
          ]) {
            const prior = bySequence.get(operation.sequence)
            if (prior && prior !== operation.operationId)
              throw new Error('Eine Operationssequenz wurde mit anderer Kennung wiederverwendet.')
            bySequence.set(operation.sequence, operation.operationId)
          }
          const sequences = [...bySequence.keys()].sort((a, b) => a - b)
          if (sequences.some((sequence, index) => sequence !== index + 1)) {
            throw new Error(
              'Das Änderungspaket enthält eine Lücke in der Operationsfolge. Bitte ein vollständiges Paket dieses Geräts importieren.',
            )
          }
        }
        remaining.sort((a, b) => a.deviceId.localeCompare(b.deviceId) || a.sequence - b.sequence)
        const applied: DeviceOperation[] = []
        // A package can contain several histories; postpone operations whose predecessor is not present yet.
        while (remaining.length) {
          let progressed = false
          const blockedDevices = new Set<string>()
          for (let index = 0; index < remaining.length;) {
            const operation = remaining[index]
            if (blockedDevices.has(operation.deviceId)) {
              index++
              continue
            }
            const table = database.table(operation.tableName)
            const current = ((await table.get(operation.recordId)) as Row | undefined) ?? null
            if (operation.resolutionParents) {
              const parentOperations = operation.resolutionParents
                .map((parentId) => operations.find((item) => item.operationId === parentId))
                .filter((item): item is DeviceOperation => Boolean(item))
              if (parentOperations.length === 2) {
                const parentBeforeMatch = await Promise.all(
                  parentOperations.map((parent) => equalRow(parent.after, operation.before)),
                )
                const parentAfterMatch = await Promise.all(
                  parentOperations.map((parent) => equalRow(parent.after, operation.after)),
                )
                const matchesParentStates =
                  parentBeforeMatch.some(Boolean) && parentAfterMatch.some(Boolean)
                const matchesCurrent =
                  (await equalRow(current, operation.before)) ||
                  (await equalRow(current, operation.after))
                if (matchesCurrent && matchesParentStates) {
                  if (operation.after) await table.put(operation.after)
                  else await table.delete(operation.recordId)
                  if (!(await database.deviceOperations.get(operation.operationId))) {
                    await database.deviceOperations.add(operation)
                    applied.push(operation)
                  }
                  for (const parent of parentOperations) {
                    if (!(await database.deviceOperations.get(parent.operationId))) {
                      await database.deviceOperations.add(parent)
                      applied.push(parent)
                    }
                    const parentIndex = remaining.findIndex(
                      (item) => item.operationId === parent.operationId,
                    )
                    if (parentIndex >= 0) remaining.splice(parentIndex, 1)
                  }
                  const mergeIndex = remaining.findIndex(
                    (item) => item.operationId === operation.operationId,
                  )
                  if (mergeIndex >= 0) remaining.splice(mergeIndex, 1)
                  progressed = true
                  continue
                }
              }
            }
            // A full snapshot can already contain a later state from this uninterrupted
            // record history, while the snapshot itself has no operation journal.
            // Recognize only a provable chain; otherwise keep the conflict for review.
            let representedByLaterState = false
            let chainState = operation.after
            for (const later of remaining.slice(index + 1)) {
              if (
                later.deviceId !== operation.deviceId ||
                later.tableName !== operation.tableName ||
                later.recordId !== operation.recordId
              )
                continue
              if (!(await equalRow(chainState, later.before))) break
              chainState = later.after
              if (await equalRow(current, chainState)) {
                representedByLaterState = true
                break
              }
            }
            if (
              representedByLaterState &&
              !(await equalRow(current, operation.before)) &&
              !(await equalRow(current, operation.after))
            ) {
              await database.deviceOperations.add(operation)
              applied.push(operation)
              remaining.splice(index, 1)
              progressed = true
              continue
            }
            if (
              (await equalRow(current, operation.before)) ||
              (await equalRow(current, operation.after))
            ) {
              if (!(await equalRow(current, operation.after))) {
                if (operation.after) await table.put(operation.after)
                else await table.delete(operation.recordId)
              }
              await database.deviceOperations.add(operation)
              applied.push(operation)
              remaining.splice(index, 1)
              progressed = true
            } else {
              blockedDevices.add(operation.deviceId)
              index++
            }
          }
          if (!progressed) {
            const operation = remaining[0]
            const table = database.table(operation.tableName)
            const current = ((await table.get(operation.recordId)) as Row | undefined) ?? null
            const mergeIndex = remaining.findIndex(
              (candidate) =>
                candidate.resolutionParents?.includes(operation.operationId) &&
                candidate.tableName === operation.tableName &&
                candidate.recordId === operation.recordId,
            )
            if (mergeIndex > 0) {
              const merge = remaining[mergeIndex]
              const localMatchesMerge =
                (await equalRow(current, merge.before)) ||
                (await equalRow(current, merge.after))
              const incomingMatchesMerge =
                (await equalRow(operation.after, merge.before)) ||
                (await equalRow(operation.after, merge.after))
              const parentsComplete = merge.resolutionParents?.every((parentId) =>
                operations.some((item) => item.operationId === parentId),
              )
              if (localMatchesMerge && incomingMatchesMerge && parentsComplete) {
                if (merge.after) await table.put(merge.after)
                else await table.delete(operation.recordId)
                await database.deviceOperations.add(operation)
                await database.deviceOperations.add(merge)
                applied.push(operation, merge)
                remaining.splice(mergeIndex, 1)
                remaining.shift()
                progressed = true
                continue
              }
            }
            const original = pending?.conflicts.find(
              (item) => item.operationId === operation.operationId,
            )
            if (!resolution || !original)
              throw new PendingChangesConflict({
                table: operation.tableName,
                recordId: operation.recordId,
                local: current,
                incoming: operation.after,
                operationId: operation.operationId,
              })
            if (
              !(await equalRow(original.local, current)) ||
              !(await equalRow(original.incoming, operation.after))
            )
              throw new Error(
                'Der Konflikt hat sich seit der Prüfung geändert. Es wurden keine Daten verändert.',
              )
            if (operation.after) await table.put(operation.after)
            else await table.delete(operation.recordId)
            await database.deviceOperations.add(operation)
            applied.push(operation)
            const localHeads = await database.deviceOperations
              .where('[tableName+recordId]')
              .equals([operation.tableName, operation.recordId])
              .toArray()
            const localHead = (
              await Promise.all(
                localHeads.map(async (item) => ({
                  item,
                  matches: await equalRow(item.after, current),
                })),
              )
            )
              .filter(({ matches }) => matches)
              .map(({ item }) => item)
              .sort((left, right) => right.sequence - left.sequence)[0]
            const resolutionParents =
              localHead ? ([localHead.operationId, operation.operationId] as const) : undefined
            if (resolution === 'local')
              await mutateJournaledRecord(
                operation.tableName,
                operation.recordId,
                localDevice,
                () => current,
                database,
                resolutionParents,
              )
            else
              await appendObservedOperation(
                operation.tableName,
                operation.recordId,
                current,
                operation.after,
                localDevice,
                database,
                resolutionParents,
              )
            remaining.shift()
          }
        }
        const birds = await database.birds.toArray()
        const birdIds = new Set(birds.map((bird) => bird.id))
        const media = await database.mediaAssets.toArray()
        const mediaById = new Map(media.map((item) => [item.id, item]))
        for (const bird of birds)
          if (bird.imageId) {
            const item = mediaById.get(bird.imageId)
            if (!item || (item.relatedType === 'bird-profile' && item.relatedId !== bird.id))
              throw new Error('Das Paket hinterlässt einen ungültigen Bildverweis.')
          }
        for (const item of media)
          if (
            item.relatedType === 'bird-profile' &&
            (!item.relatedId || !birdIds.has(item.relatedId))
          )
            throw new Error('Das Paket hinterlässt einen ungültigen Medienverweis.')
        for (const name of [
          'medications',
          'weights',
          'observations',
          'healthEvents',
          'vetAppointments',
          'reminders',
        ]) {
          const records = (await database.table(name).toArray()) as Row[]
          if (
            records.some(
              (row) => row.birdId && (typeof row.birdId !== 'string' || !birdIds.has(row.birdId)),
            )
          )
            throw new Error('Das Paket hinterlässt einen ungültigen Vogelverweis.')
        }
        if (preview) throw new PreviewComplete({ applied: applied.length, alreadyKnown: known })
        for (const item of packages)
          await database.appMetadata.put({
            id: `device-change-package:${item.packageId}`,
            value: item.fileHash,
          })
        if (resolution && pending)
          await database.devicePendingPackages.put({
            ...pending,
            resolvedAt: new Date().toISOString(),
            resolvedChoice: resolution,
          })
        if (applied.length)
          await database.appMetadata.put({
            id: 'device-import-last-successful-at',
            value: new Date().toISOString(),
          })
        return { applied: applied.length, alreadyKnown: known }
      },
    )
  } catch (error) {
    if (error instanceof PreviewComplete) return error.result
    if (preview && error instanceof PendingChangesConflict)
      return { applied: 0, alreadyKnown: 0, conflicts: 1 }
    if (!(error instanceof PendingChangesConflict)) throw error
    if (packages.length > 1)
      throw new Error(
        'Mindestens ein Paket enthält einen Konflikt. Bitte die Pakete einzeln einlesen und entscheiden.',
      )
    await database.transaction('rw', database.devicePendingPackages, async () => {
      const existing = await database.devicePendingPackages.get(packageId)
      if (existing) {
        if (existing.kind !== 'changes' || existing.resolvedAt)
          throw new Error('Das Konfliktpaket ist nicht mehr offen.')
        const savedHash = await Dexie.waitFor(
          existing.archive
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
        if (!existing.conflicts.some((item) => item.operationId === error.conflict.operationId)) {
          await database.devicePendingPackages.put({
            ...existing,
            conflicts: [...existing.conflicts, error.conflict],
          })
        }
      } else {
        await database.devicePendingPackages.add({
          packageId,
          kind: 'changes',
          createdAt: new Date().toISOString(),
          archive: file,
          conflicts: [error.conflict],
        })
      }
    })
    const saved = await database.devicePendingPackages.get(packageId)
    return { applied: 0, alreadyKnown: 0, conflicts: saved?.conflicts.length ?? 1 }
  }
}

/** Simulate the complete import in a transaction that is always rolled back. */
export function previewChangesExport(file: Blob): Promise<ChangesResult> {
  return processChanges([file], null, true)
}

export function previewChangesExports(files: Blob[]): Promise<ChangesResult> {
  return processChanges(files, null, true)
}
export function importChangesExports(
  files: Blob[],
  database: AppDatabase = appDatabase,
  localDeviceId?: string,
): Promise<ChangesResult> {
  return processChanges(files, null, false, database, localDeviceId)
}

export function importChangesExport(file: Blob) {
  return processChanges([file], null)
}

export async function resolveChanges(
  packageId: string,
  choice: 'local' | 'incoming',
  database: AppDatabase = appDatabase,
  localDeviceId?: string,
) {
  const pending = await database.devicePendingPackages.get(packageId)
  if (!pending || pending.kind !== 'changes' || pending.resolvedAt)
    throw new Error('Das Konfliktpaket ist nicht mehr offen.')
  return processChanges([pending.archive], choice, false, database, localDeviceId)
}
