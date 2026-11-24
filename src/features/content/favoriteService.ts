import { favoriteRepository, removeFavorite } from '../../data/repositories/favoriteRepository'
import { RepositoryError } from '../../data/repositories/repositoryErrors'
export const CONTENT_FAVORITE_WIKI = 'wiki-article'
export const CONTENT_FAVORITE_PLANT = 'plant-article'
export async function favoriteIds(itemType: string): Promise<Set<string>> {
  return new Set(
    (await favoriteRepository.list())
      .filter((item) => item.itemType === itemType)
      .map((item) => item.itemId),
  )
}
export async function toggleFavorite(
  itemType: string,
  itemId: string,
  title: string,
  current: boolean,
): Promise<void> {
  if (current) {
    await removeFavorite(itemType, itemId)
    return
  }
  try {
    await favoriteRepository.create({ itemType, itemId, title })
  } catch (error) {
    if (!(
      error instanceof RepositoryError &&
      error.cause instanceof Error &&
      error.cause.name === 'ConstraintError'
    ))
      throw error
  }
}
