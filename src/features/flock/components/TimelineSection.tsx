import { useMemo, useState } from 'react'
import { DocumentationAccordion } from './DocumentationAccordion'
import { TimelineFilters } from './TimelineFilters'
import { TimelineList } from './TimelineList'
import { useTimeline } from '../hooks/useTimeline'
import { filterTimeline, type TimelineFilter } from '../services/timelineService'

export function TimelineSection({
  birdId,
  refreshToken,
}: {
  birdId: string
  refreshToken: number
}) {
  const { items, loading, error } = useTimeline(birdId, refreshToken)
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const filteredItems = useMemo(() => filterTimeline(items, filter), [filter, items])
  return (
    <DocumentationAccordion title="Chronik" icon="bookOpen">
      <div className="documentation-section">
        <TimelineFilters value={filter} onChange={setFilter} />
        {loading && <p role="status">Chronik wird geladen …</p>}
        {error && (
          <p role="alert" className="flock-message flock-message--error">
            {error}
          </p>
        )}
        {!loading && !error && <TimelineList items={filteredItems} birdId={birdId} />}
      </div>
    </DocumentationAccordion>
  )
}
