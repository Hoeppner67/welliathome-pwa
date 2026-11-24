import { appDatabase } from '../../data/database/appDatabase'
import {
  PERSONAL_TABLES,
  appendObservedOperation,
  type PersonalTable,
  type DeviceOperation,
} from './changeJournal'
import { deviceId } from './fullExport'
import { sameRow } from './importFullExport'

type Row = Record<string, unknown> & { id: string }
type Records = Record<PersonalTable, Row[]>
export interface ReconciliationBaseline {
  id: string
  records: Records
  operationIds: string[]
  resolvedPackageIds?: string[]
}

async function equal(a: Row | null, b: Row | null): Promise<boolean> {
  return a === null || b === null ? a === b : sameRow(a, b)
}
async function readRecords(): Promise<Records> {
  const records = {} as Records
  for (const name of PERSONAL_TABLES)
    records[name] = (await appDatabase.table(name).toArray()) as Row[]
  return records
}
function key(table: string, id: string): string {
  return JSON.stringify([table, id])
}

/** Called explicitly before disabling; no work is scheduled while disabled. */
export async function captureReconciliationBaseline(): Promise<void> {
  const tables = PERSONAL_TABLES.map((name) => appDatabase.table(name))
  await appDatabase.transaction(
    'rw',
    [
      ...tables,
      appDatabase.deviceOperations,
      appDatabase.deviceReconciliation,
      appDatabase.devicePendingPackages,
    ],
    async () => {
      const records = await readRecords()
      const operationIds = await appDatabase.deviceOperations.toCollection().primaryKeys()
      const resolvedPackageIds = (await appDatabase.devicePendingPackages.toArray())
        .filter((item) => item.resolvedAt)
        .map((item) => item.packageId)
      await appDatabase.deviceReconciliation.put({
        id: 'current',
        records,
        operationIds,
        resolvedPackageIds,
      })
    },
  )
}

/** Reconcile current records against the last local baseline without replacing them. */
export async function reconcileChanges(): Promise<{ captured: number; initialized: boolean }> {
  const device = deviceId()
  const tables = PERSONAL_TABLES.map((name) => appDatabase.table(name))
  return appDatabase.transaction(
    'rw',
    [
      ...tables,
      appDatabase.deviceOperations,
      appDatabase.deviceReconciliation,
      appDatabase.devicePendingPackages,
      appDatabase.appMetadata,
    ],
    async () => {
      const baseline = await appDatabase.deviceReconciliation.get('current')
      const current = await readRecords()
      const allOperations = await appDatabase.deviceOperations.toArray()
      const resolvedPackages = (await appDatabase.devicePendingPackages.toArray()).filter(
        (item) => item.resolvedAt,
      )
      const resolvedPackageIds = resolvedPackages.map((item) => item.packageId)
      if (!baseline) {
        await appDatabase.deviceReconciliation.put({
          id: 'current',
          records: current,
          operationIds: allOperations.map((op) => op.operationId),
          resolvedPackageIds,
        })
        return { captured: 0, initialized: true }
      }
      const known = new Set(baseline.operationIds)
      const recent = allOperations.filter((op) => !known.has(op.operationId))
      const knownResolutions = new Set(baseline.resolvedPackageIds ?? [])
      const incomingResolutions = resolvedPackages
        .filter(
          (item) => item.resolvedChoice === 'incoming' && !knownResolutions.has(item.packageId),
        )
        .flatMap((item) => item.conflicts)
      const previous = new Map<string, Row>()
      const actual = new Map<string, Row>()
      for (const name of PERSONAL_TABLES) {
        for (const row of baseline.records[name]) previous.set(key(name, row.id), row)
        for (const row of current[name]) actual.set(key(name, row.id), row)
      }
      let captured = 0
      for (const name of PERSONAL_TABLES) {
        const ids = new Set([
          ...baseline.records[name].map((row) => row.id),
          ...current[name].map((row) => row.id),
        ])
        for (const id of ids) {
          let expected: Row | null = previous.get(key(name, id)) ?? null
          const now: Row | null = actual.get(key(name, id)) ?? null
          if (await equal(expected, now)) continue
          const candidates: DeviceOperation[] = recent.filter(
            (op) => op.tableName === name && op.recordId === id,
          )
          const decisions = incomingResolutions.filter(
            (item) => item.table === name && item.recordId === id,
          )
          // Follow only an unambiguous chain of recorded before/after versions.
          while (candidates.length || decisions.length) {
            const matches: DeviceOperation[] = []
            for (const op of candidates) if (await equal(op.before, expected)) matches.push(op)
            if (!matches.length) {
              const matchingDecisions = []
              for (const decision of decisions)
                if (await equal(decision.local, expected)) matchingDecisions.push(decision)
              if (!matchingDecisions.length) break
              for (const decision of matchingDecisions.slice(1)) {
                if (!(await equal(decision.incoming, matchingDecisions[0].incoming)))
                  throw new Error(
                    'Die lokale Konfliktfolge ist mehrdeutig. Bitte die Daten vor dem Teilen prüfen.',
                  )
              }
              expected = matchingDecisions[0].incoming
              for (const decision of matchingDecisions)
                decisions.splice(decisions.indexOf(decision), 1)
              continue
            }
            for (const op of matches.slice(1)) {
              if (!(await equal(op.after, matches[0].after)))
                throw new Error(
                  'Die lokale Änderungsfolge ist mehrdeutig. Bitte die Daten vor dem Teilen prüfen.',
                )
            }
            expected = matches[0].after
            for (const op of matches) candidates.splice(candidates.indexOf(op), 1)
          }
          if ((candidates.length || decisions.length) && !(await equal(expected, now)))
            throw new Error(
              'Die lokale Änderungsfolge ist unvollständig. Bitte die Daten vor dem Teilen prüfen.',
            )
          if (!(await equal(expected, now))) {
            await appendObservedOperation(name, id, expected, now, device)
            captured++
          }
        }
      }
      const operationIds = await appDatabase.deviceOperations.toCollection().primaryKeys()
      await appDatabase.deviceReconciliation.put({
        id: 'current',
        records: current,
        operationIds,
        resolvedPackageIds,
      })
      return { captured, initialized: false }
    },
  )
}
