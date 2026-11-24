import type { Medication } from '../../../models'
import { localIsoDate } from '../../../utils/date'

export type MedicationStatus = 'planned' | 'active' | 'completed'
export interface MedicationGroups {
  planned: Medication[]
  active: Medication[]
  completed: Medication[]
}

export function medicationStatus(medication: Medication, today = localIsoDate()): MedicationStatus {
  if (medication.startDate > today) return 'planned'
  if (medication.endDate !== undefined && medication.endDate < today) return 'completed'
  return 'active'
}

export function groupMedications(
  medications: Medication[],
  today = localIsoDate(),
): MedicationGroups {
  const groups: MedicationGroups = { planned: [], active: [], completed: [] }
  for (const medication of medications) groups[medicationStatus(medication, today)].push(medication)
  const sortNewestFirst = (left: Medication, right: Medication) =>
    right.startDate.localeCompare(left.startDate) ||
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  groups.planned.sort(sortNewestFirst)
  groups.active.sort(sortNewestFirst)
  groups.completed.sort(sortNewestFirst)
  return groups
}
