import Dexie, { type EntityTable } from 'dexie'
import type {
  AppMetadata,
  BirdProfile,
  Favorite,
  FeedMix,
  HealthEvent,
  MediaAsset,
  Medication,
  Observation,
  Reminder,
  VetAppointment,
  WeightEntry,
  WikiArticle,
  WikiCategory,
  PlantArticle,
  ContentSyncStatus,
} from '../../models'
import type { ReconciliationBaseline } from '../../features/settings/reconcileChanges'
import type { DeviceOperation } from '../../features/settings/changeJournal'
import type { PendingPackage } from '../../features/settings/importFullExport'
import { plainTextFromHtml } from '../../features/content/plainTextFromHtml'
import { DATABASE_VERSIONS } from './schema'
import { DatabaseInitializationError } from '../repositories/repositoryErrors'

export class AppDatabase extends Dexie {
  birds!: EntityTable<BirdProfile, 'id'>
  medications!: EntityTable<Medication, 'id'>
  weights!: EntityTable<WeightEntry, 'id'>
  observations!: EntityTable<Observation, 'id'>
  healthEvents!: EntityTable<HealthEvent, 'id'>
  vetAppointments!: EntityTable<VetAppointment, 'id'>
  reminders!: EntityTable<Reminder, 'id'>
  feedMixes!: EntityTable<FeedMix, 'id'>
  favorites!: EntityTable<Favorite, 'id'>
  mediaAssets!: EntityTable<MediaAsset, 'id'>
  wikiArticles!: EntityTable<WikiArticle, 'id'>
  wikiCategories!: EntityTable<WikiCategory, 'id'>
  plants!: EntityTable<PlantArticle, 'id'>
  contentSyncStatus!: EntityTable<ContentSyncStatus, 'id'>
  appMetadata!: EntityTable<AppMetadata, 'id'>
  devicePendingPackages!: EntityTable<PendingPackage, 'packageId'>
  deviceOperations!: EntityTable<DeviceOperation, 'operationId'>
  deviceReconciliation!: EntityTable<ReconciliationBaseline, 'id'>

  constructor(name = 'WelliAtHomePwa') {
    super(name)
    for (const [version, schema] of Object.entries(DATABASE_VERSIONS)) {
      const definition = this.version(Number(version)).stores(schema)
      if (Number(version) === 4) {
        definition.upgrade((transaction) =>
          transaction
            .table<WikiArticle>('wikiArticles')
            .toCollection()
            .modify((article) => {
              article.searchText = plainTextFromHtml(
                `${article.excerptHtml} ${article.contentHtml}`,
              )
            }),
        )
      }
      if (Number(version) === 5) {
        definition.upgrade((transaction) =>
          transaction
            .table<WikiArticle>('wikiArticles')
            .toCollection()
            .modify((article) => {
              if (!article.searchText) {
                article.searchText = plainTextFromHtml(
                  `${article.excerptHtml} ${article.contentHtml}`,
                )
              }
            }),
        )
      }
    }
  }
}

export const appDatabase = new AppDatabase()

export async function initializeDatabase(): Promise<AppDatabase> {
  try {
    await appDatabase.open()
    return appDatabase
  } catch (error) {
    if (error instanceof DatabaseInitializationError) throw error
    throw new DatabaseInitializationError(
      'Die lokale Welli@Home-Datenbank konnte nicht geöffnet werden.',
      error,
    )
  }
}
