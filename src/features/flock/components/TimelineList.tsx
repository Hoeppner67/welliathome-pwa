import type { TimelineItem } from '../services/timelineService'
import { Card } from '../../../shared/components/Card'
import { Icon, type IconName } from '../../../shared/components/Icon'
import { formatIsoDate } from '../utils/weightValidation'

const eventMeta: Record<TimelineItem['sourceType'], { label: string; icon: IconName }> = {
  observation: { label: 'Beobachtung', icon: 'note' },
  problem: { label: 'Problem', icon: 'health' },
  vet: { label: 'Tierarzt', icon: 'stethoscope' },
  medication: { label: 'Medikament', icon: 'capsule' },
}

export function TimelineList({ items, birdId }: { items: TimelineItem[]; birdId: string }) {
  const visibleItems = items.filter((item) => item.birdId === birdId)
  if (visibleItems.length === 0)
    return (
      <p className="documentation-empty">Für diesen Filter gibt es noch keine Chronikeinträge.</p>
    )
  return (
    <ol className="timeline-list">
      {visibleItems.map((item) => {
        const meta = eventMeta[item.sourceType]
        return (
          <li
            key={item.key}
            className={item.isFuture ? 'timeline-item timeline-item--future' : 'timeline-item'}
          >
            <Card as="article" className="timeline-card">
              <div className="timeline-card__header">
                <Icon name={item.iconType} className="timeline-card__icon" />
                <span className="timeline-card__type">{meta.label}</span>
                {item.isFuture && <span className="timeline-card__future">Geplant</span>}
                {item.date && <time dateTime={item.date}>{formatIsoDate(item.date)}</time>}
              </div>
              <h3>{item.title}</h3>
              {item.description && <p>{item.description}</p>}
              {item.details && <p className="timeline-card__details">{item.details}</p>}
            </Card>
          </li>
        )
      })}
    </ol>
  )
}
