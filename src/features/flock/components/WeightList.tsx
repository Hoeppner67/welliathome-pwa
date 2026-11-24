import type { WeightEntry } from '../../../models'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { formatIsoDate } from '../utils/weightValidation'
import { sortWeightEntries } from '../utils/weightSorting'

export function WeightList({
  entries,
  onEdit,
  onDelete,
}: {
  entries: WeightEntry[]
  onEdit: (entry: WeightEntry) => void
  onDelete: (entry: WeightEntry) => void
}) {
  const sorted = sortWeightEntries(entries, 'desc')
  if (!sorted.length)
    return <p className="documentation-empty">Noch keine Gewichtseinträge vorhanden.</p>
  return (
    <ol className="weight-list" aria-label="Gewichtseinträge, neueste zuerst">
      {sorted.map((entry) => (
        <li key={entry.id}>
          <Card as="div" className="weight-list__item">
            <div className="weight-list__measure">
              <time dateTime={entry.date}>{formatIsoDate(entry.date)}</time>
              <strong>
                {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(entry.weight)}{' '}
                g
              </strong>
            </div>
            {entry.notes && <p className="weight-list__notes">{entry.notes}</p>}
            <div className="record-actions">
              <Button type="button" variant="secondary" onClick={() => onEdit(entry)}>
                Bearbeiten
              </Button>
              <Button type="button" variant="secondary" onClick={() => onDelete(entry)}>
                Löschen
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ol>
  )
}
