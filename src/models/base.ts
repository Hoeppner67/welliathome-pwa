export type ISODate = string
export type ISOTimestamp = string

export interface Entity {
  id: string
  createdAt: ISOTimestamp
  updatedAt: ISOTimestamp
}

export type NewEntity<T extends Entity> = Omit<T, keyof Entity> &
  Partial<Pick<T, 'id' | 'createdAt' | 'updatedAt'>>

export type EntityUpdate<T extends Entity> = Partial<Omit<T, keyof Entity>>
