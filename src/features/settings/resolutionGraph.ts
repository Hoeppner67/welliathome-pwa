/** A structural check only; it does not authorize applying a resolution. */
export interface ResolutionGraphNode {
  id: string
  table: string
  recordId: string
  parents?: readonly [string, string]
}

/** Reject ambiguous IDs, missing or foreign parents, self references and cycles. */
export function isValidResolutionGraph(nodes: readonly ResolutionGraphNode[]): boolean {
  const byId = new Map<string, ResolutionGraphNode>()
  for (const node of nodes) {
    if (!node.id || !node.table || !node.recordId || byId.has(node.id)) return false
    byId.set(node.id, node)
  }
  for (const node of nodes) {
    if (!node.parents) continue
    const [first, second] = node.parents
    if (first === second || first === node.id || second === node.id) return false
    for (const parentId of node.parents) {
      const parent = byId.get(parentId)
      if (!parent || parent.table !== node.table || parent.recordId !== node.recordId) return false
    }
  }
  const completed = new Set<string>()
  const active = new Set<string>()
  for (const node of nodes) {
    const pending: Array<{ id: string; leaving: boolean }> = [{ id: node.id, leaving: false }]
    while (pending.length) {
      const current = pending.pop()!
      if (current.leaving) {
        active.delete(current.id)
        completed.add(current.id)
        continue
      }
      if (completed.has(current.id)) continue
      if (active.has(current.id)) return false
      active.add(current.id)
      pending.push({ id: current.id, leaving: true })
      for (const parent of byId.get(current.id)!.parents ?? [])
        pending.push({ id: parent, leaving: false })
    }
  }
  return true
}
