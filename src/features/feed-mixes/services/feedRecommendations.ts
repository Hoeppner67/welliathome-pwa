import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import { feedMixRepository } from '../../../data/repositories'
import type { FeedMix } from '../../../models'
import {
  FEED_RECOMMENDATIONS_INITIALIZATION_ID,
  FEED_RECOMMENDATIONS_INITIALIZED_VALUE,
} from '../../../models/appMetadata'

type Recommendation = Omit<FeedMix, 'id' | 'createdAt' | 'updatedAt'>

export const FEED_RECOMMENDATIONS: readonly Recommendation[] = [
  {
    name: 'Welli-Fit',
    provider: 'Mr. Crumble',
    ingredients: [
      'Plata-Hirse, Silberhirse, Rote Hirse, Senegalhirse und Grüne Hirse (55 %)',
      'Kanariensaat (20 %)',
      'Haferkerne (5 %)',
      'Grassamen (20 %)',
    ],
    productUrl:
      'https://www.mr-crumble.shop/vogel/wellensittichfutter-koernermischung?number=MCV001-2.5',
  },
  {
    name: 'Welli-Topfit',
    provider: 'Mr. Crumble',
    ingredients: [
      'Plata-Hirse, Silberhirse, Rote Hirse, Senegalhirse und Grüne Hirse (55 %)',
      'Kanariensaat (20 %)',
      'Haferkerne (4,5 %)',
      'Grassamen (15 %)',
      'Spinatsamen (2,5 %) und Salatsamen (2,5 %)',
      'Kräuter und Blüten (5 %)',
      'Mineralien (0,5 %)',
    ],
    productUrl:
      'https://www.mr-crumble.shop/vogel/welli-topfit-wellensittichfutter-mit-kraeutern?number=MCV094-1',
  },
  {
    name: 'Wellensittich Light',
    provider: 'Blattner',
    ingredients: [
      'Senegalhirse, Gelbe Hirse, Silberhirse, Japanhirse, Rote Hirse, Mohairhirse, Mannahirse und Grüne Hirse',
      'Kanariensaat',
      'Rotschwingelgras, Raygras, Knaulgras und Wiesenrispengras (22 %)',
      'Unkrautsämereien',
    ],
    productUrl: 'https://blattner-heimtierfutter.de/37959-Wellensittich-Light-2-5-kg.html',
  },
  {
    name: 'Primus Basis',
    provider: 'Claus',
    ingredients: [
      'Silberhirse, La Plata Hirse, Japanhirse, Rote Hirse, Senegalhirse, Grüne Hirse, Mohairhirse und Mannahirse (60 %)',
      'Glanzsaat (25 %)',
      'Wiesenschwingel, Pagima Green und Knaulgras (10 %)',
      'Haferkerne',
      'Kräuter',
    ],
    productUrl: 'https://claus-futter.de/collections/wellensittichfutter/products/primus-basis',
    notes: '10 % Rabatt mit dem Code Welli@Home10',
  },
]

export async function initializeFeedRecommendations(): Promise<void> {
  await initializeDatabase()
  await appDatabase.transaction(
    'rw',
    appDatabase.feedMixes,
    appDatabase.appMetadata,
    appDatabase.deviceOperations,
    async () => {
      const marker = await appDatabase.appMetadata.get(FEED_RECOMMENDATIONS_INITIALIZATION_ID)
      if (marker?.value === FEED_RECOMMENDATIONS_INITIALIZED_VALUE) return

      const existingMixes = await feedMixRepository.list()
      for (const recommendation of FEED_RECOMMENDATIONS) {
        const alreadyPresent = existingMixes.some(
          (mix) =>
            mix.name.localeCompare(recommendation.name, 'de-DE', { sensitivity: 'base' }) === 0 &&
            (mix.provider ?? '').localeCompare(recommendation.provider ?? '', 'de-DE', {
              sensitivity: 'base',
            }) === 0,
        )
        if (!alreadyPresent) {
          const created = await feedMixRepository.create(recommendation)
          existingMixes.push(created)
        }
      }

      await appDatabase.appMetadata.put({
        id: FEED_RECOMMENDATIONS_INITIALIZATION_ID,
        value: FEED_RECOMMENDATIONS_INITIALIZED_VALUE,
      })
    },
  )
}
