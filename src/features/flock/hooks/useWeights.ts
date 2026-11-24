import { useCallback, useEffect, useState } from 'react'
import type { WeightEntry } from '../../../models'
import { weightRepository } from '../../../data/repositories'

export function useWeights(birdId: string) {
  const [entries, setEntries] = useState<WeightEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEntries(await weightRepository.listByBirdId(birdId, { sortBy: 'date', direction: 'desc' }))
    } catch {
      setError('Die Gewichtseinträge konnten nicht aus dem lokalen Speicher geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [birdId])
  useEffect(() => {
    void reload()
  }, [reload])
  return { entries, loading, error, reload }
}
