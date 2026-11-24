import { useCallback, useEffect, useState } from 'react'
import type { Medication } from '../../../models'
import { medicationRepository } from '../../../data/repositories'

export function useMedications(birdId: string) {
  const [entries, setEntries] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEntries(
        await medicationRepository.listByBirdId(birdId, { sortBy: 'startDate', direction: 'desc' }),
      )
    } catch {
      setError('Die Medikamenteneinträge konnten nicht aus dem lokalen Speicher geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [birdId])
  useEffect(() => {
    void reload()
  }, [reload])
  return { entries, loading, error, reload }
}
