import type { TimelineFilter } from '../services/timelineService'

const filters: { id: TimelineFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'observation', label: 'Beobachtungen' },
  { id: 'problem', label: 'Probleme' },
  { id: 'vet', label: 'Tierarzt' },
  { id: 'medication', label: 'Medikamente' },
]

export function TimelineFilters({
  value,
  onChange,
}: {
  value: TimelineFilter
  onChange: (value: TimelineFilter) => void
}) {
  return (
    <div className="timeline-filters" role="group" aria-label="Chronik filtern">
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className="timeline-filter"
          aria-pressed={value === filter.id}
          onClick={() => onChange(filter.id)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  )
}
