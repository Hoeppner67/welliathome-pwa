import type { Entity } from './base'

export interface BirdProfile extends Entity {
  name: string
  nickname?: string
  species: string
  gender?: string
  hatchDate?: string
  arrivalDate?: string
  color?: string
  ringNumber?: string
  origin?: string
  notes?: string
  imageId?: string
}
