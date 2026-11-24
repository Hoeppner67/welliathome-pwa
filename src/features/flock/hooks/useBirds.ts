import { useCallback, useEffect, useState } from 'react'
import type { BirdProfile } from '../../../models'
import { birdRepository } from '../../../data/repositories'

export function useBirds() {
  const [birds, setBirds] = useState<BirdProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setBirds(await birdRepository.list())
    } catch {
      setError(
        'Die Vogelprofile konnten nicht geladen werden. Prüfe, ob der lokale Datenbankspeicher verfügbar ist.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])
  return { birds, loading, error, reload }
}
