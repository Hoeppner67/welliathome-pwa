import type { Favorite } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { validateFavorite } from './validators'
import { activeJournalDevice, writeCompoundRecord } from '../../features/settings/changeJournal'

export const favoriteRepository = new BaseRepository<Favorite>(
  appDatabase.favorites,
  'favorites',
  validateFavorite,
  'createdAt',
)

export async function removeFavorite(itemType: string, itemId: string): Promise<void> {
  const device = activeJournalDevice()
  await appDatabase.transaction(
    'rw',
    appDatabase.favorites,
    appDatabase.deviceOperations,
    appDatabase.appMetadata,
    async () => {
      const favorite = await appDatabase.favorites
        .where('[itemType+itemId]')
        .equals([itemType, itemId])
        .first()
      if (favorite) await writeCompoundRecord('favorites', favorite.id, null, device)
    },
  )
}
