/** Explicit provenance is required: undefined means unknown, [] means a root. */
export interface CausalOperation {
  operationId: string
  tableName: string
  recordId: string
  predecessors?: readonly string[]
}

/**
 * Returns graph heads only when every supplied operation has explicit, complete,
 * same-record provenance. The caller must independently prove the supplied set
 * contains the complete relevant history; this function cannot establish that.
 */
export function causalHeads(operations: readonly CausalOperation[]): string[] | undefined {
  if (operations.length === 0) return undefined
  const byId = new Map<string, CausalOperation>()
  const target = operations[0]
  for (const operation of operations) {
    if (
      !operation.operationId ||
      !operation.tableName ||
      !operation.recordId ||
      !operation.predecessors ||
      byId.has(operation.operationId) ||
      operation.tableName !== target.tableName ||
      operation.recordId !== target.recordId
    )
      return undefined
    byId.set(operation.operationId, operation)
  }
  const referenced = new Set<string>()
  for (const operation of operations) {
    const unique = new Set(operation.predecessors)
    if (unique.size !== operation.predecessors!.length) return undefined
    for (const predecessorId of unique) {
      const predecessor = byId.get(predecessorId)
      if (
        !predecessor ||
        predecessor.tableName !== operation.tableName ||
        predecessor.recordId !== operation.recordId
      )
        return undefined
      referenced.add(predecessorId)
    }
  }
  const done = new Set<string>()
  const active = new Set<string>()
  for (const operation of operations) {
    const stack = [{ id: operation.operationId, exiting: false }]
    while (stack.length) {
      const item = stack.pop()!
      if (item.exiting) {
        active.delete(item.id)
        done.add(item.id)
        continue
      }
      if (done.has(item.id)) continue
      if (active.has(item.id)) return undefined
      active.add(item.id)
      stack.push({ id: item.id, exiting: true })
      for (const predecessor of byId.get(item.id)!.predecessors!)
        stack.push({ id: predecessor, exiting: false })
    }
  }
  return operations
    .filter((operation) => !referenced.has(operation.operationId))
    .map((operation) => operation.operationId)
}
