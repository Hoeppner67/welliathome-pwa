import type {
  ContentSyncSource,
  ContentSyncStatus,
  PlantArticle,
  WikiArticle,
  WikiCategory,
} from '../../models'
import { appDatabase } from '../database/appDatabase'

const statusId = (source: ContentSyncSource) => source

export const editorialRepository = {
  async listWikiArticles(): Promise<WikiArticle[]> {
    const rows = await appDatabase.wikiArticles.toArray()
    return rows.sort(
      (a, b) => a.title.localeCompare(b.title, 'de-DE', { sensitivity: 'base' }) || a.wpId - b.wpId,
    )
  },

  async getWikiArticle(id: string): Promise<WikiArticle | undefined> {
    return appDatabase.wikiArticles.get(id)
  },

  async listWikiCategories(): Promise<WikiCategory[]> {
    const rows = await appDatabase.wikiCategories.toArray()
    return rows.sort(
      (a, b) => a.name.localeCompare(b.name, 'de-DE', { sensitivity: 'base' }) || a.wpId - b.wpId,
    )
  },

  async listPlants(): Promise<PlantArticle[]> {
    const rows = await appDatabase.plants.toArray()
    return rows.sort(
      (a, b) => a.title.localeCompare(b.title, 'de-DE', { sensitivity: 'base' }) || a.wpId - b.wpId,
    )
  },

  async getPlant(id: string): Promise<PlantArticle | undefined> {
    return appDatabase.plants.get(id)
  },

  async getSyncStatus(source: ContentSyncSource): Promise<ContentSyncStatus | undefined> {
    return appDatabase.contentSyncStatus.get(statusId(source))
  },

  async replaceWikiContent(
    articles: WikiArticle[],
    categories: WikiCategory[],
    syncedAt: string,
    details?: Pick<ContentSyncStatus, 'syncCursor' | 'skippedCount'>,
  ): Promise<void> {
    const status: ContentSyncStatus = {
      id: statusId('wellipedia'),
      lastSuccessfulAt: syncedAt,
      ...details,
      itemCount: articles.length,
      createdAt: syncedAt,
      updatedAt: syncedAt,
    }
    await appDatabase.transaction(
      'rw',
      appDatabase.wikiArticles,
      appDatabase.wikiCategories,
      appDatabase.contentSyncStatus,
      async () => {
        await appDatabase.wikiArticles.clear()
        await appDatabase.wikiCategories.clear()
        await appDatabase.wikiArticles.bulkAdd(articles)
        await appDatabase.wikiCategories.bulkAdd(categories)
        await appDatabase.contentSyncStatus.put(status)
      },
    )
  },

  async replacePlants(
    plants: PlantArticle[],
    syncedAt: string,
    details?: Pick<ContentSyncStatus, 'syncCursor' | 'skippedCount'>,
  ): Promise<void> {
    const status: ContentSyncStatus = {
      id: statusId('plants'),
      lastSuccessfulAt: syncedAt,
      ...details,
      itemCount: plants.length,
      createdAt: syncedAt,
      updatedAt: syncedAt,
    }
    await appDatabase.transaction(
      'rw',
      appDatabase.plants,
      appDatabase.contentSyncStatus,
      async () => {
        await appDatabase.plants.clear()
        await appDatabase.plants.bulkAdd(plants)
        await appDatabase.contentSyncStatus.put(status)
      },
    )
  },
}
