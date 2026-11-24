import Dexie from 'dexie'
import { appDatabase, type AppDatabase } from '../../data/database/appDatabase'
import { createId } from '../../utils/id'

export const PERSONAL_TABLES = [
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
export type PersonalTable = (typeof PERSONAL_TABLES)[number]
type RecordValue = Record<string, unknown> & { id: string }
export interface DeviceOperation {
  operationId: string
  deviceId: string
  sequence: number
  tableName: PersonalTable
  recordId: string
  action: 'put' | 'delete'
  before: RecordValue | null
  after: RecordValue | null
  createdAt: string
  resolutionParents?: readonly [string, string]
}

/** Applies a validated record mutation and its journal entry in one transaction. */
export async function mutateJournaledRecord(
  tableName: PersonalTable,
  recordId: string,
  deviceId: string,
  update: (before: RecordValue | null) => RecordValue | null | undefined,
  database: AppDatabase = appDatabase,
  resolutionParents?: readonly [string, string],
): Promise<DeviceOperation | null> {
  if (!(PERSONAL_TABLES as readonly string[]).includes(tableName) || !recordId || !deviceId)
    throw new Error('Ungültige Änderungsoperation.')
  const table = database.table(tableName)
  return database.transaction(
    'rw',
    table,
    database.deviceOperations,
    database.appMetadata,
    async () => {
      const before = ((await table.get(recordId)) as RecordValue | undefined) ?? null
      const after = update(before)
      if (after === undefined || (!before && !after)) return null
      if (after && after.id !== recordId) throw new Error('Ungültige Änderungsoperation.')
      if (after) await table.put(after)
      else await table.delete(recordId)
      const operation = await appendObservedOperation(
        tableName,
        recordId,
        before,
        after,
        deviceId,
        database,
        resolutionParents,
      )
      return operation
    },
  )
}

/** Appends a previously observed change inside the caller's active transaction. */
export async function appendObservedOperation(
  tableName: PersonalTable,
  recordId: string,
  before: RecordValue | null,
  after: RecordValue | null,
  deviceId: string,
  database: AppDatabase = appDatabase,
  resolutionParents?: readonly [string, string],
): Promise<DeviceOperation> {
  if (!Dexie.currentTransaction)
    throw new Error('Die Änderungsoperation benötigt eine aktive Datenbanktransaktion.')
  if ((!before && !after) || (before && before.id !== recordId) || (after && after.id !== recordId))
    throw new Error('Ungültige Änderungsoperation.')
  // The browser may retain localStorage after IndexedDB is cleared. In that
  // case a fresh identity prevents sequence numbers from being reused.
  const idKey = 'welliathome-device-id-v1'
  const usedKey = 'welliathome-device-operation-used-v1'
  const priorKey = 'welliathome-device-operation-prior-v1'
  let isLocal = false
  if (typeof localStorage !== 'undefined') {
    const current = localStorage.getItem(idKey)
    const used = localStorage.getItem(usedKey)
    if (
      current &&
      current !== deviceId &&
      localStorage.getItem(priorKey) === deviceId &&
      used === current
    )
      deviceId = current
    isLocal = current === deviceId || (current !== null && localStorage.getItem(idKey) === deviceId)
  }
  let sequenceKey = `device-operation-sequence:${deviceId}`
  let previous = await database.appMetadata.get(sequenceKey)
  if (isLocal && !previous && localStorage.getItem(usedKey) === deviceId) {
    const previousId = deviceId
    deviceId = createId()
    localStorage.setItem(priorKey, previousId)
    localStorage.setItem(idKey, deviceId)
    sequenceKey = `device-operation-sequence:${deviceId}`
    previous = await database.appMetadata.get(sequenceKey)
  }
  if (isLocal) localStorage.setItem(usedKey, deviceId)
  const oldSequence = previous ? Number(previous.value) : 0
  if (
    !Number.isSafeInteger(oldSequence) ||
    oldSequence < 0 ||
    oldSequence >= Number.MAX_SAFE_INTEGER
  )
    throw new Error('Der Zähler des Änderungsprotokolls ist ungültig.')
  const operation: DeviceOperation = {
    operationId: createId(),
    deviceId,
    sequence: oldSequence + 1,
    tableName,
    recordId,
    action: after ? 'put' : 'delete',
    before,
    after,
    createdAt: new Date().toISOString(),
    ...(resolutionParents ? { resolutionParents } : {}),
  }
  await database.deviceOperations.add(operation)
  await database.appMetadata.put({ id: sequenceKey, value: String(operation.sequence) })
  return operation
}
export function commitJournaledChange(
  tableName: PersonalTable,
  recordId: string,
  after: RecordValue | null,
  deviceId: string,
): Promise<DeviceOperation | null> {
  return mutateJournaledRecord(tableName, recordId, deviceId, () => after)
}

/** Capture the device once at the start of a compound transaction. */
export function activeJournalDevice(): string | null {
  if (typeof localStorage === 'undefined') return null
  const key = 'welliathome-device-id-v1'
  let id = localStorage.getItem(key)
  if (localStorage.getItem('welliathome-device-sync-enabled') !== 'true') return null
  if (!id) {
    id = createId()
    localStorage.setItem(key, id)
  }
  return id
}

/** The caller's transaction must include the target, metadata and deviceOperations stores. */
export async function writeCompoundRecord(
  tableName: PersonalTable,
  id: string,
  value: RecordValue | null,
  device: string | null,
  create = false,
): Promise<void> {
  const table = appDatabase.table(tableName)
  if (!device) {
    if (value === null) await table.delete(id)
    else if (create) await table.add(value)
    else await table.put(value)
    return
  }
  await mutateJournaledRecord(tableName, id, device, (before) => {
    if (create && before) throw new Error('Ein Datensatz mit dieser ID existiert bereits.')
    return value
  })
}
