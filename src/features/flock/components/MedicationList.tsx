import type { Medication } from '../../../models'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { formatIsoDate } from '../utils/weightValidation'
import { groupMedications } from '../utils/medicationStatus'

const labels = [
  ['planned', 'Geplante Behandlungen'],
  ['active', 'Laufende Behandlungen'],
  ['completed', 'Abgeschlossene Behandlungen'],
] as const

export function MedicationList({
  entries,
  onEdit,
  onDelete,
}: {
  entries: Medication[]
  onEdit: (entry: Medication) => void
  onDelete: (entry: Medication) => void
}) {
  const groups = groupMedications(entries)
  if (!entries.length) return <p className="documentation-empty">Noch keine Medikamente erfasst.</p>
  return (
    <div className="medication-groups">
      {labels.map(([key, title]) => {
        const medications = groups[key]
        return (
          <section key={key} aria-labelledby={`medication-group-${key}`}>
            <h3 id={`medication-group-${key}`} className="medication-group__title">
              {title}
            </h3>
            {medications.length === 0 ? (
              <p className="medication-group__empty">Keine Einträge in dieser Gruppe.</p>
            ) : (
              <ol className="medication-list">
                {medications.map((entry) => (
                  <li key={entry.id}>
                    <Card as="div" className="medication-list__item">
                      <h4>{entry.name}</h4>
                      <dl className="medication-list__details">
                        {entry.dosage && (
                          <div>
                            <dt>Dosierung / Menge</dt>
                            <dd>{entry.dosage}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Beginn</dt>
                          <dd>
                            <time dateTime={entry.startDate}>{formatIsoDate(entry.startDate)}</time>
                          </dd>
                        </div>
                        {entry.endDate && (
                          <div>
                            <dt>Ende</dt>
                            <dd>
                              <time dateTime={entry.endDate}>{formatIsoDate(entry.endDate)}</time>
                            </dd>
                          </div>
                        )}
                        {entry.notes && (
                          <div className="medication-list__notes">
                            <dt>Notizen</dt>
                            <dd>{entry.notes}</dd>
                          </div>
                        )}
                      </dl>
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
            )}
          </section>
        )
      })}
    </div>
  )
}
