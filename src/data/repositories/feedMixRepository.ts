import type { FeedMix } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { validateFeedMix } from './validators'

export const feedMixRepository = new BaseRepository<FeedMix>(
  appDatabase.feedMixes,
  'feedMixes',
  validateFeedMix,
  'name',
)
