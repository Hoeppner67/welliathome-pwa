import type { BirdProfile, MediaAsset, NewEntity } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { DependentBirdDataError, RepositoryError } from './repositoryErrors'
import { validateBirdProfile, validateMediaAsset } from './validators'
import { createId } from '../../utils/id'
import { nextIsoTimestamp, nowIsoTimestamp } from '../../utils/date'
import {
  activeJournalDevice,
  writeCompoundRecord,
  type PersonalTable,
} from '../../features/settings/changeJournal'

const dependentTables = [
  appDatabase.medications,
  appDatabase.weights,
  appDatabase.observations,
  appDatabase.healthEvents,
  appDatabase.vetAppointments,
  appDatabase.reminders,
] as const

export interface BirdDependentRecordCounts {
  medications: number
  weights: number
  observations: number
  healthEvents: number
  vetAppointments: number
  reminders: number
}

export class BirdDeletePreviewChangedError extends Error {
  constructor(readonly currentCounts: BirdDependentRecordCounts) {
    super('Die zugehörigen Einträge haben sich seit der Löschvorschau geändert.')
    this.name = 'BirdDeletePreviewChangedError'
  }
}

async function countDependentRecords(birdId: string): Promise<BirdDependentRecordCounts> {
  const [medications, weights, observations, healthEvents, vetAppointments, reminders] =
    await Promise.all([
      appDatabase.medications.where('birdId').equals(birdId).count(),
      appDatabase.weights.where('birdId').equals(birdId).count(),
      appDatabase.observations.where('birdId').equals(birdId).count(),
      appDatabase.healthEvents.where('birdId').equals(birdId).count(),
      appDatabase.vetAppointments.where('birdId').equals(birdId).count(),
      appDatabase.reminders.where('birdId').equals(birdId).count(),
    ])
  return { medications, weights, observations, healthEvents, vetAppointments, reminders }
}

function dependentRecordTotal(counts: BirdDependentRecordCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0)
}

function sameDependentCounts(
  left: BirdDependentRecordCounts,
  right: BirdDependentRecordCounts,
): boolean {
  return (Object.keys(left) as (keyof BirdDependentRecordCounts)[]).every(
    (key) => left[key] === right[key],
  )
}

export class BirdRepository extends BaseRepository<BirdProfile> {
  constructor() {
    super(appDatabase.birds, 'birds', validateBirdProfile, 'name')
  }

  override async list(): Promise<BirdProfile[]> {
    const birds = await super.list()
    return birds.sort((left, right) =>
      left.name.localeCompare(right.name, 'de', { sensitivity: 'base', numeric: true }),
    )
  }

  async getDependentRecordCount(birdId: string): Promise<number> {
    return dependentRecordTotal(await this.getDependentRecordCounts(birdId))
  }

  async getDependentRecordCounts(birdId: string): Promise<BirdDependentRecordCounts> {
    try {
      return await appDatabase.transaction('r', dependentTables, () =>
        countDependentRecords(birdId),
      )
    } catch (error) {
      throw new RepositoryError('countDependencies', 'bird-related records', error)
    }
  }

  async createWithImage(
    input: Parameters<BaseRepository<BirdProfile>['create']>[0],
    image: NewEntity<MediaAsset>,
  ): Promise<BirdProfile> {
    const createdAt = input.createdAt ?? nowIsoTimestamp()
    const bird = {
      ...input,
      id: input.id ?? createId(),
      imageId: image.id ?? createId(),
      createdAt,
      updatedAt: input.updatedAt ?? createdAt,
    } as BirdProfile
    const media = this.prepareMedia({ ...image, id: bird.imageId }, bird.id)
    validateBirdProfile(bird)
    validateMediaAsset(media)

    try {
      const device = activeJournalDevice()
      await appDatabase.transaction(
        'rw',
        appDatabase.birds,
        appDatabase.mediaAssets,
        appDatabase.deviceOperations,
        appDatabase.appMetadata,
        async () => {
          await writeCompoundRecord(
            'mediaAssets',
            media.id,
            media as unknown as Record<string, unknown> & { id: string },
            device,
            true,
          )
          await writeCompoundRecord(
            'birds',
            bird.id,
            bird as unknown as Record<string, unknown> & { id: string },
            device,
            true,
          )
        },
      )
      return bird
    } catch (error) {
      throw new RepositoryError('createWithImage', 'birds and mediaAssets', error)
    }
  }

  async updateWithImage(
    id: string,
    changes: Parameters<BaseRepository<BirdProfile>['update']>[1],
    image: NewEntity<MediaAsset> | null | undefined,
  ): Promise<BirdProfile | undefined> {
    if (image === undefined) return super.update(id, changes)

    try {
      const device = activeJournalDevice()
      return await appDatabase.transaction(
        'rw',
        appDatabase.birds,
        appDatabase.mediaAssets,
        appDatabase.deviceOperations,
        appDatabase.appMetadata,
        async () => {
          const existing = await appDatabase.birds.get(id)
          if (!existing) return undefined
          const imageId = image ? (image.id ?? createId()) : undefined
          const updated = {
            ...existing,
            ...changes,
            id: existing.id,
            createdAt: existing.createdAt,
            imageId,
            updatedAt: nextIsoTimestamp(existing.updatedAt),
          }
          validateBirdProfile(updated)

          if (image) {
            const media = this.prepareMedia({ ...image, id: imageId }, id)
            validateMediaAsset(media)
            await writeCompoundRecord(
              'mediaAssets',
              media.id,
              media as unknown as Record<string, unknown> & { id: string },
              device,
              true,
            )
          }
          await writeCompoundRecord(
            'birds',
            updated.id,
            updated as unknown as Record<string, unknown> & { id: string },
            device,
          )
          await this.removeIfUnreferenced(existing.imageId, id, device)
          return updated
        },
      )
    } catch (error) {
      if (error instanceof RepositoryError) throw error
      throw new RepositoryError('updateWithImage', 'birds and mediaAssets', error)
    }
  }

  override async delete(id: string): Promise<boolean> {
    try {
      const device = activeJournalDevice()
      return await appDatabase.transaction(
        'rw',
        [
          appDatabase.birds,
          appDatabase.mediaAssets,
          ...dependentTables,
          appDatabase.deviceOperations,
          appDatabase.appMetadata,
        ],
        async () => {
          const bird = await appDatabase.birds.get(id)
          if (!bird) return false
          const counts = await Promise.all(
            dependentTables.map((table) => table.where('birdId').equals(id).count()),
          )
          const total = counts.reduce((sum, count) => sum + count, 0)
          if (total > 0) throw new DependentBirdDataError(total)
          await writeCompoundRecord('birds', id, null, device)
          await this.removeIfUnreferenced(bird.imageId, id, device)
          return true
        },
      )
    } catch (error) {
      if (error instanceof DependentBirdDataError) throw error
      throw new RepositoryError('delete', 'birds and related data', error)
    }
  }

  async deleteWithRelatedData(
    id: string,
    expectedCounts: BirdDependentRecordCounts,
  ): Promise<boolean> {
    try {
      const device = activeJournalDevice()
      return await appDatabase.transaction(
        'rw',
        [
          appDatabase.birds,
          appDatabase.mediaAssets,
          ...dependentTables,
          appDatabase.deviceOperations,
          appDatabase.appMetadata,
        ],
        async () => {
          const bird = await appDatabase.birds.get(id)
          if (!bird) return false

          const currentCounts = await countDependentRecords(id)
          if (!sameDependentCounts(currentCounts, expectedCounts)) {
            throw new BirdDeletePreviewChangedError(currentCounts)
          }

          for (const table of dependentTables) {
            const rows = await table.where('birdId').equals(id).toArray()
            for (const row of rows)
              await writeCompoundRecord(table.name as PersonalTable, row.id, null, device)
          }
          await writeCompoundRecord('birds', id, null, device)
          await this.removeIfUnreferenced(bird.imageId, id, device)
          return true
        },
      )
    } catch (error) {
      if (error instanceof BirdDeletePreviewChangedError) throw error
      throw new RepositoryError('deleteWithRelatedData', 'birds and related data', error)
    }
  }

  private prepareMedia(image: NewEntity<MediaAsset>, birdId: string): MediaAsset {
    const createdAt = image.createdAt ?? nowIsoTimestamp()
    return {
      ...image,
      id: image.id ?? createId(),
      relatedType: 'bird-profile',
      relatedId: birdId,
      createdAt,
      updatedAt: image.updatedAt ?? createdAt,
    } as MediaAsset
  }

  private async removeIfUnreferenced(
    imageId: string | undefined,
    excludingBirdId: string,
    device: string | null,
  ): Promise<void> {
    if (!imageId) return
    const birds = await appDatabase.birds.toArray()
    const remainingReferences = birds.filter(
      (bird) => bird.id !== excludingBirdId && bird.imageId === imageId,
    ).length
    if (remainingReferences === 0) await writeCompoundRecord('mediaAssets', imageId, null, device)
  }
}

export const birdRepository = new BirdRepository()
