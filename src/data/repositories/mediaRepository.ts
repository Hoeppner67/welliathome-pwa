import type { MediaAsset } from '../../models'
import { appDatabase } from '../database/appDatabase'
import { BaseRepository } from './baseRepository'
import { validateMediaAsset } from './validators'

export const mediaRepository = new BaseRepository<MediaAsset>(
  appDatabase.mediaAssets,
  'mediaAssets',
  validateMediaAsset,
  'createdAt',
)
