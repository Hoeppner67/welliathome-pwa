import type { WeightEntry } from '../../../models'

export function sortWeightEntries(
  entries: WeightEntry[],
  direction: 'asc' | 'desc' = 'asc',
): WeightEntry[] {
  const multiplier = direction === 'asc' ? 1 : -1
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (left, right) =>
        multiplier * left.entry.date.localeCompare(right.entry.date) ||
        multiplier * left.entry.createdAt.localeCompare(right.entry.createdAt) ||
        left.entry.id.localeCompare(right.entry.id) ||
        left.index - right.index,
    )
    .map(({ entry }) => entry)
}
