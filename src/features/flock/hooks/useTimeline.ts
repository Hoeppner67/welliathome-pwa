import { useCallback, useEffect, useState } from 'react'
import { timelineService, type TimelineItem } from '../services/timelineService'

export function useTimeline(birdId: string, refreshToken: number) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await timelineService.listByBirdId(birdId))
    } catch {
      setError('Die Chronik konnte nicht aus dem lokalen Speicher geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [birdId])

  useEffect(() => {
    void reload()
  }, [reload, refreshToken])
  return { items, loading, error, reload }
}
