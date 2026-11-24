import { useState } from 'react'
import type { EventKind, EventInput, FlockEvent } from '../services/eventService'
import { eventService } from '../services/eventService'
import { useEvents } from '../hooks/useEvents'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { DocumentationAccordion } from './DocumentationAccordion'
import { EventForm } from './EventForm'
import { EventList } from './EventList'
import { Button } from '../../../shared/components/Button'
import '../../../styles/events.css'

export function EventSection({
  birdId,
  onDataChanged,
}: {
  birdId: string
  onDataChanged: () => void
}) {
  const { events, loading, error, reload } = useEvents(birdId)
  const [formOpen, setFormOpen] = useState(false)
  const newKind: EventKind = 'observation'
  const [editing, setEditing] = useState<FlockEvent | undefined>()
  const [deleting, setDeleting] = useState<FlockEvent | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  async function save(input: EventInput) {
    setSaving(true)
    setNotice('')
    setActionError('')
    try {
      if (editing) await eventService.update(birdId, editing, input)
      else await eventService.create(birdId, input)
      await reload()
      setEditing(undefined)
      setFormOpen(false)
      setNotice(editing ? 'Ereignis wurde geändert.' : 'Ereignis wurde gespeichert.')
      onDataChanged()
    } finally {
      setSaving(false)
    }
  }

  async function removeEvent() {
    if (!deleting) return
    setDeletingBusy(true)
    setActionError('')
    try {
      await eventService.delete(birdId, deleting)
      setDeleting(null)
      await reload()
      setNotice('Ereignis wurde gelöscht.')
      onDataChanged()
    } catch {
      setDeleting(null)
      setActionError(
        'Das Ereignis konnte nicht gelöscht werden. Es wurde möglicherweise bereits entfernt.',
      )
    } finally {
      setDeletingBusy(false)
    }
  }

  function cancelForm() {
    setEditing(undefined)
    setFormOpen(false)
  }

  return (
    <DocumentationAccordion title="Ereignisse" icon="note">
      <div className="documentation-section">
        {notice && (
          <p role="status" className="flock-message flock-message--success">
            {notice}
          </p>
        )}
        {actionError && (
          <p role="alert" className="flock-message flock-message--error">
            {actionError}
          </p>
        )}
        <div className="event-section__toolbar">
          <p>Beobachtungen, Probleme und Tierarzttermine zu diesem Vogel.</p>
          <Button
            type="button"
            onClick={() => {
              setNotice('')
              setEditing(undefined)
              setFormOpen(true)
            }}
          >
            Ereignis hinzufügen
          </Button>
        </div>
        {formOpen && (
          <EventForm
            key={editing ? `edit:${editing.kind}:${editing.record.id}` : `new:${newKind}`}
            entry={editing}
            initialKind={newKind}
            saving={saving}
            onSave={save}
            onCancel={cancelForm}
          />
        )}
        {loading && <p role="status">Ereignisse werden geladen …</p>}
        {error && (
          <p role="alert" className="flock-message flock-message--error">
            {error}
          </p>
        )}
        {!loading && !error && (
          <EventList
            events={events}
            onEdit={(event) => {
              setNotice('')
              setFormOpen(true)
              setEditing(event)
            }}
            onDelete={(event) => setDeleting(event)}
          />
        )}
      </div>
      {deleting && (
        <ConfirmDeleteDialog
          title="Ereignis löschen?"
          description="Möchtest du dieses Ereignis wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
          confirmLabel="Ereignis löschen"
          busy={deletingBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void removeEvent()}
        />
      )}
    </DocumentationAccordion>
  )
}
