import { useEffect, useState } from 'react'
import type { BirdProfile } from '../../../models'
import { birdRepository } from '../../../data/repositories'

export function useBird(birdId: string | undefined) {
  const [bird, setBird] = useState<BirdProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    if (!birdId) {
      setBird(null)
      setLoading(false)
      return
    }
    void birdRepository
      .getById(birdId)
      .then((value) => {
        if (active) setBird(value ?? null)
      })
      .catch(() => {
        if (active)
          setError('Das Vogelprofil konnte nicht aus dem lokalen Speicher geladen werden.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [birdId])
  return { bird, loading, error, setBird }
}
