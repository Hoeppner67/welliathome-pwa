import type { Medication, WeightEntry } from '../../../models'
import { medicationRepository, weightRepository } from '../../../data/repositories'
import { appDatabase } from '../../../data/database/appDatabase'

export type WeightInput = Pick<WeightEntry, 'date' | 'weight'> & Pick<WeightEntry, 'notes'>
export type MedicationInput = Pick<Medication, 'name' | 'startDate'> &
  Partial<Pick<Medication, 'dosage' | 'endDate' | 'notes'>>

export class DocumentationEntryNotFoundError extends Error {
  constructor() {
    super('Der Eintrag wurde nicht gefunden oder gehört zu einem anderen Vogel.')
    this.name = 'DocumentationEntryNotFoundError'
  }
}

async function withEntry<T extends { birdId: string }, R>(
  repository: { getById(id: string): Promise<T | undefined> },
  birdId: string,
  id: string,
  action: () => Promise<R>,
): Promise<R> {
  return appDatabase.transaction(
    'rw',
    [
      appDatabase.birds,
      appDatabase.weights,
      appDatabase.medications,
      appDatabase.deviceOperations,
      appDatabase.appMetadata,
    ],
    async () => {
      const current = await repository.getById(id)
      if (!current || current.birdId !== birdId) throw new DocumentationEntryNotFoundError()
      return action()
    },
  )
}

export const documentationService = {
  createWeight(birdId: string, input: WeightInput) {
    return weightRepository.create({ ...input, birdId })
  },

  async updateWeight(birdId: string, id: string, input: WeightInput): Promise<WeightEntry> {
    return withEntry(weightRepository, birdId, id, async () => {
      const updated = await weightRepository.update(id, input)
      if (!updated || updated.birdId !== birdId) throw new DocumentationEntryNotFoundError()
      return updated
    })
  },

  async deleteWeight(birdId: string, id: string): Promise<void> {
    return withEntry(weightRepository, birdId, id, async () => {
      if (!(await weightRepository.delete(id))) throw new DocumentationEntryNotFoundError()
    })
  },

  createMedication(birdId: string, input: MedicationInput) {
    return medicationRepository.create({ ...input, birdId })
  },

  async updateMedication(birdId: string, id: string, input: MedicationInput): Promise<Medication> {
    return withEntry(medicationRepository, birdId, id, async () => {
      const updated = await medicationRepository.update(id, input)
      if (!updated || updated.birdId !== birdId) throw new DocumentationEntryNotFoundError()
      return updated
    })
  },

  async deleteMedication(birdId: string, id: string): Promise<void> {
    return withEntry(medicationRepository, birdId, id, async () => {
      if (!(await medicationRepository.delete(id))) throw new DocumentationEntryNotFoundError()
    })
  },
}
