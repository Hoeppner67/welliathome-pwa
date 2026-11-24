import type { FlockEvent } from '../services/eventService'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { Icon, type IconName } from '../../../shared/components/Icon'
import { formatIsoDate } from '../utils/weightValidation'

const eventMeta: Record<FlockEvent['kind'], { label: string; icon: IconName }> = {
  observation: { label: 'Beobachtung', icon: 'note' },
  problem: { label: 'Problem', icon: 'health' },
  vet: { label: 'Tierarzt', icon: 'stethoscope' },
}

function titleFor(event: FlockEvent): string {
  if (event.kind === 'observation') return event.record.title?.trim() || 'Beobachtung'
  return event.record.title
}

export function EventList({
  events,
  onEdit,
  onDelete,
}: {
  events: FlockEvent[]
  onEdit: (event: FlockEvent) => void
  onDelete: (event: FlockEvent) => void
}) {
  if (events.length === 0)
    return <p className="documentation-empty">Noch keine Ereignisse vorhanden.</p>
  return (
    <ol className="event-list">
      {events.map((event) => {
        const meta = eventMeta[event.kind]
        const title = titleFor(event)
        const description =
          event.kind === 'vet'
            ? event.record.diagnosis
              ? `Diagnose: ${event.record.diagnosis}`
              : event.record.reason
                ? `Anlass: ${event.record.reason}`
                : ''
            : event.kind === 'problem'
              ? event.record.description
              : event.record.description
        const notes =
          event.kind === 'problem' || event.kind === 'vet' ? event.record.notes : undefined
        return (
          <li key={`${event.kind}:${event.record.id}`}>
            <Card as="article" className="event-card">
              <div className="event-card__header">
                <Icon name={meta.icon} className="event-card__icon" />
                <span className="event-card__type">{meta.label}</span>
                <time dateTime={event.record.date}>{formatIsoDate(event.record.date)}</time>
              </div>
              <h3>{title}</h3>
              {description && <p className="event-card__description">{description}</p>}
              {notes && (
                <p className="event-card__notes">
                  <span className="event-card__detail-label">Notizen: </span>
                  {notes}
                </p>
              )}
              <div className="record-actions">
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={`Ereignis bearbeiten: ${title}`}
                  onClick={() => onEdit(event)}
                >
                  Bearbeiten
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={`Ereignis löschen: ${title}`}
                  onClick={() => onDelete(event)}
                >
                  Löschen
                </Button>
              </div>
            </Card>
          </li>
        )
      })}
    </ol>
  )
}
