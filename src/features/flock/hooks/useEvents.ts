import { useCallback, useEffect, useState } from 'react'
import { eventService, type FlockEvent } from '../services/eventService'

export function useEvents(birdId: string) {
  const [events, setEvents] = useState<FlockEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEvents(await eventService.listByBirdId(birdId))
    } catch {
      setError('Die Ereignisse konnten nicht aus dem lokalen Speicher geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [birdId])

  useEffect(() => {
    void reload()
  }, [reload])
  return { events, loading, error, reload }
}
