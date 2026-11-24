import type { Entity } from './base'

export interface WikiCategory extends Entity {
  wpId: number
  slug: string
  name: string
  parentId?: number
}

export interface WikiArticle extends Entity {
  wpId: number
  slug: string
  title: string
  permalink: string
  contentHtml: string
  displayHtml?: string
  excerptHtml: string
  searchText?: string
  categoryIds: string[]
  featuredImageUrl?: string
  featuredImageAlt?: string
  featuredImageCaption?: string
}

export interface PlantArticle extends Entity {
  wpId: number
  slug: string
  title: string
  permalink: string
  contentHtml: string
  displayHtml?: string
  groupNames: string[]
  scientificName?: string
  foodParts: string[]
  /** Introductory paragraph used in plant overview cards. */
  introText?: string
  /** Legacy field retained so existing local records remain readable. */
  summary?: string
  warningNotes: string[]
  harvestNotes?: string
  effectNotes?: string
  imageUrl?: string
  imageAlt?: string
  imageCaption?: string
  searchText: string
}

export type ContentSyncSource = 'wellipedia' | 'plants'

export interface ContentSyncStatus extends Entity {
  lastSuccessfulAt: string
  itemCount: number
  syncCursor?: string
  skippedCount?: number
}
