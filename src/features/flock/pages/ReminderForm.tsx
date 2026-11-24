import { useState, type FormEvent } from 'react'
import type { BirdProfile, NewEntity, Reminder } from '../../../models'
import { Button } from '../../../shared/components/Button'
import { isIsoDate } from '../../../utils/date'

interface ReminderFormProps {
  birds: BirdProfile[]
  reminder?: Reminder
  onSave: (input: NewEntity<Reminder>) => Promise<void>
  onCancel: () => void
}

export function ReminderForm({ birds, reminder, onSave, onCancel }: ReminderFormProps) {
  const [title, setTitle] = useState(reminder?.title ?? '')
  const [dueDate, setDueDate] = useState(reminder?.dueDate ?? '')
  const [reminderType, setReminderType] = useState(reminder?.reminderType ?? 'Allgemein')
  const [birdId, setBirdId] = useState(reminder?.birdId ?? '')
  const [description, setDescription] = useState(reminder?.description ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedTitle = title.trim()
    const normalizedType = reminderType.trim()
    if (!normalizedTitle) {
      setError('Bitte gib einen Titel ein.')
      return
    }
    if (!isIsoDate(dueDate)) {
      setError('Bitte wähle ein gültiges Fälligkeitsdatum.')
      return
    }
    if (!normalizedType) {
      setError('Bitte gib eine Kategorie ein.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave({
        title: normalizedTitle,
        dueDate,
        reminderType: normalizedType,
        completed: reminder?.completed ?? false,
        ...(birdId ? { birdId } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      })
    } catch {
      setError(
        'Die Erinnerung konnte nicht gespeichert werden. Prüfe den lokalen Speicher und versuche es erneut.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="card reminder-form"
      data-guard-unsaved
      onSubmit={(event) => void handleSubmit(event)}
    >
      <h2>{reminder ? 'Erinnerung bearbeiten' : 'Erinnerung hinzufügen'}</h2>
      <div className="reminder-form__fields">
        <div className="form-field form-field--wide">
          <label htmlFor="reminder-title">Titel</label>
          <input
            id="reminder-title"
            autoFocus
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="reminder-due-date">Fällig am</label>
          <input
            id="reminder-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="reminder-type">Kategorie</label>
          <input
            id="reminder-type"
            maxLength={60}
            value={reminderType}
            onChange={(event) => setReminderType(event.target.value)}
            required
          />
        </div>
        <div className="form-field form-field--wide">
          <label htmlFor="reminder-bird">Wellensittich (optional)</label>
          <select
            id="reminder-bird"
            value={birdId}
            onChange={(event) => setBirdId(event.target.value)}
          >
            <option value="">Keinem Vogel zugeordnet</option>
            {birds.map((bird) => (
              <option key={bird.id} value={bird.id}>
                {bird.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field form-field--wide">
          <label htmlFor="reminder-description">Notiz (optional)</label>
          <textarea
            id="reminder-description"
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>
      {error && (
        <p className="form-field__error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button type="submit" disabled={saving}>
          {saving
            ? 'Wird gespeichert …'
            : reminder
              ? 'Änderungen speichern'
              : 'Erinnerung speichern'}
        </Button>
        <Button
          className="button--align-right"
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  )
}
