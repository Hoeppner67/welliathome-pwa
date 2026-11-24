import { useState } from 'react'
import type { Medication } from '../../../models'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { DocumentationAccordion } from './DocumentationAccordion'
import { MedicationForm } from './MedicationForm'
import type { MedicationInput } from '../services/documentationService'
import { MedicationList } from './MedicationList'
import { useMedications } from '../hooks/useMedications'
import { documentationService } from '../services/documentationService'

export function MedicationSection({
  birdId,
  onDataChanged,
}: {
  birdId: string
  onDataChanged?: () => void
}) {
  const { entries, loading, error, reload } = useMedications(birdId)
  const [editing, setEditing] = useState<Medication | undefined>()
  const [deleting, setDeleting] = useState<Medication | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  async function save(values: MedicationInput) {
    setSaving(true)
    setNotice('')
    setActionError('')
    try {
      if (editing) await documentationService.updateMedication(birdId, editing.id, values)
      else await documentationService.createMedication(birdId, values)
      await reload()
      onDataChanged?.()
      setNotice(editing ? 'Medikamenteneintrag wurde geändert.' : 'Medikament wurde gespeichert.')
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
      await documentationService.deleteMedication(birdId, deleting.id)
      setDeleting(null)
      await reload()
      onDataChanged?.()
      setNotice('Medikamenteneintrag wurde gelöscht.')
    } catch {
      setDeleting(null)
      setActionError(
        'Der Medikamenteneintrag konnte nicht gelöscht werden. Er wurde möglicherweise bereits entfernt.',
      )
    } finally {
      setDeletingBusy(false)
    }
  }

  return (
    <DocumentationAccordion title="Medikamente" icon="capsule">
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
        <MedicationForm
          key={editing?.id ?? 'new-medication'}
          entry={editing}
          saving={saving}
          onSave={save}
          onCancel={editing ? () => setEditing(undefined) : undefined}
        />
        {loading && <p role="status">Medikamente werden geladen …</p>}
        {error && (
          <p className="flock-message flock-message--error" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && (
          <MedicationList
            entries={entries}
            onEdit={(entry) => {
              setNotice('')
              setActionError('')
              setEditing(entry)
            }}
            onDelete={(entry) => setDeleting(entry)}
          />
        )}
      </div>
      {deleting && (
        <ConfirmDeleteDialog
          title="Medikament löschen?"
          description="Möchtest du diesen Medikamenteneintrag wirklich löschen?"
          confirmLabel="Medikament löschen"
          busy={deletingBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void deleteEntry()}
        />
      )}
    </DocumentationAccordion>
  )
}
