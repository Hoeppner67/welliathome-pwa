import type { DeviceOperation } from './changeJournal'

type Row = DeviceOperation['after']
type EqualRows = (left: Row, right: Row) => Promise<boolean>

/**
 * Conservative proof for one directly diverged pair. The caller must derive the
 * complete current head set from verified journal history, not from row values.
 * A true result is only one prerequisite for an atomic import, not permission to write.
 */
export async function matchesDirectResolutionPrerequisites(
  local: DeviceOperation,
  incoming: DeviceOperation,
  decision: DeviceOperation,
  choice: 'local' | 'incoming',
  localHeadIds: readonly string[],
  current: Row,
  equal: EqualRows,
): Promise<boolean> {
  const ids = new Set([local.operationId, incoming.operationId, decision.operationId])
  if (ids.size !== 3 || !local.operationId || !incoming.operationId || !decision.operationId)
    return false
  if (
    [incoming, decision].some(
      (operation) =>
        operation.tableName !== local.tableName || operation.recordId !== local.recordId,
    )
  )
    return false
  if (
    localHeadIds.length !== 1 ||
    ![local.operationId, incoming.operationId].includes(localHeadIds[0])
  )
    return false
  const head = localHeadIds[0] === local.operationId ? local : incoming
  const chosen = choice === 'local' ? local : incoming
  const other = choice === 'local' ? incoming : local
  if (!(await equal(local.before, incoming.before)) || (await equal(local.after, incoming.after)))
    return false
  if (!(await equal(current, head.after))) return false
  if (!(await equal(decision.before, other.after)) || !(await equal(decision.after, chosen.after)))
    return false
  return true
}
