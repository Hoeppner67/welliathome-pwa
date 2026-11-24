import { useCallback, useEffect, useState } from 'react'
import { feedMixRepository } from '../../../data/repositories'
import type { EntityUpdate, FeedMix, NewEntity } from '../../../models'
import { initializeFeedRecommendations } from '../services/feedRecommendations'

export function useFeedMixes() {
  const [mixes, setMixes] = useState<FeedMix[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await initializeFeedRecommendations()
      const stored = await feedMixRepository.list({ sortBy: 'name', direction: 'asc' })
      setMixes(stored)
    } catch {
      setError(
        'Die Körnermischungen konnten nicht geladen werden. Prüfe den lokalen Speicher und versuche es erneut.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (input: NewEntity<FeedMix>) => {
      await feedMixRepository.create(input)
      await refresh()
    },
    [refresh],
  )

  const update = useCallback(
    async (id: string, changes: EntityUpdate<FeedMix>) => {
      const updated = await feedMixRepository.update(id, changes)
      if (!updated) throw new Error('Die Körnermischung wurde nicht gefunden.')
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      const deleted = await feedMixRepository.delete(id)
      if (!deleted) throw new Error('Die Körnermischung wurde nicht gefunden.')
      await refresh()
    },
    [refresh],
  )

  return { mixes, loading, error, refresh, create, update, remove }
}
