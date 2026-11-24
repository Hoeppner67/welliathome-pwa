import { useState } from 'react'
import type { BirdProfile, WeightEntry } from '../../../models'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { DocumentationAccordion } from './DocumentationAccordion'
import { WeightChart } from './WeightChart'
import { WeightForm } from './WeightForm'
import { WeightList } from './WeightList'
import { useWeights } from '../hooks/useWeights'
import { documentationService, type WeightInput } from '../services/documentationService'
import '../../../styles/documentation.css'

export function WeightSection({ bird }: { bird: BirdProfile }) {
  const { entries, loading, error, reload } = useWeights(bird.id)
  const [editing, setEditing] = useState<WeightEntry | undefined>()
  const [deleting, setDeleting] = useState<WeightEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  async function save(input: WeightInput) {
    setSaving(true)
    setNotice('')
    setActionError('')
    try {
      if (editing) await documentationService.updateWeight(bird.id, editing.id, input)
      else await documentationService.createWeight(bird.id, input)
      await reload()
      setNotice(editing ? 'Gewichtseintrag wurde geändert.' : 'Gewichtseintrag wurde gespeichert.')
      setEditing(undefined)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry() {
    if (!deleting) return
    setDeletingBusy(true)
    setActionError('')
    try {
      await documentationService.deleteWeight(bird.id, deleting.id)
      setDeleting(null)
      await reload()
      setNotice('Gewichtseintrag wurde gelöscht.')
    } catch {
      setDeleting(null)
      setActionError(
        'Der Gewichtseintrag konnte nicht gelöscht werden. Er wurde möglicherweise bereits entfernt.',
      )
    } finally {
      setDeletingBusy(false)
    }
  }

  return (
    <DocumentationAccordion title="Gewicht" icon="scale">
      <div className="documentation-section">
        {notice && (
          <p className="flock-message flock-message--success" role="status">
            {notice}
          </p>
        )}
        {actionError && (
          <p className="flock-message flock-message--error" role="alert">
            {actionError}
          </p>
        )}
        <WeightForm
          key={editing?.id ?? 'new-weight-entry'}
          entry={editing}
          saving={saving}
          onSave={save}
          onCancel={editing ? () => setEditing(undefined) : undefined}
        />
        <section
          className="documentation-subsection"
          aria-labelledby={`weight-chart-heading-${bird.id}`}
        >
          <h3 id={`weight-chart-heading-${bird.id}`}>Gewichtsverlauf</h3>
          {loading ? (
            <p role="status">Gewichtsdaten werden geladen …</p>
          ) : error ? (
            <p className="flock-message flock-message--error" role="alert">
              {error}
            </p>
          ) : (
            <WeightChart entries={entries} birdName={bird.name} />
          )}
        </section>
        <section
          className="documentation-subsection"
          aria-labelledby={`weight-list-heading-${bird.id}`}
        >
          <h3 id={`weight-list-heading-${bird.id}`}>Alle Messwerte</h3>
          {loading ? (
            <p role="status">Einträge werden geladen …</p>
          ) : error ? (
            <p className="flock-message flock-message--error" role="alert">
              {error}
            </p>
          ) : (
            <WeightList
              entries={entries}
              onEdit={(entry) => {
                setActionError('')
                setNotice('')
                setEditing(entry)
              }}
              onDelete={(entry) => setDeleting(entry)}
            />
          )}
        </section>
      </div>
      {deleting && (
        <ConfirmDeleteDialog
          title="Gewichtseintrag löschen?"
          description="Möchtest du diesen Gewichtseintrag wirklich löschen?"
          confirmLabel="Eintrag löschen"
          busy={deletingBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void deleteEntry()}
        />
      )}
    </DocumentationAccordion>
  )
}
