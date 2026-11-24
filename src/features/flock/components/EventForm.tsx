import { useState, type FormEvent } from 'react'
import type { EventKind, EventInput, FlockEvent } from '../services/eventService'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { localIsoDate } from '../../../utils/date'
import {
  validateEventForm,
  type EventFormErrors,
  type EventFormValues,
} from '../utils/eventValidation'

function valuesFor(entry?: FlockEvent): EventFormValues {
  if (!entry)
    return {
      kind: 'observation',
      date: localIsoDate(),
      title: '',
      description: '',
      diagnosis: '',
      notes: '',
    }
  switch (entry.kind) {
    case 'observation':
      return {
        kind: entry.kind,
        date: entry.record.date,
        title: entry.record.title ?? '',
        description: entry.record.description,
        diagnosis: '',
        notes: '',
      }
    case 'problem':
      return {
        kind: entry.kind,
        date: entry.record.date,
        title: entry.record.title,
        description: entry.record.description,
        diagnosis: '',
        notes: entry.record.notes ?? '',
      }
    case 'vet':
      return {
        kind: entry.kind,
        date: entry.record.date,
        title: entry.record.title,
        description: '',
        diagnosis: entry.record.diagnosis ?? '',
        notes: entry.record.notes ?? '',
      }
  }
}

function toInput(values: EventFormValues): EventInput {
  switch (values.kind) {
    case 'observation':
      return {
        kind: 'observation',
        date: values.date,
        description: values.description.trim(),
        ...(values.title.trim() && { title: values.title.trim() }),
      }
    case 'problem':
      return {
        kind: 'problem',
        date: values.date,
        title: values.title.trim(),
        description: values.description.trim(),
        ...(values.notes.trim() && { notes: values.notes.trim() }),
      }
    case 'vet':
      return {
        kind: 'vet',
        date: values.date,
        title: values.title.trim(),
        ...(values.diagnosis.trim() && { diagnosis: values.diagnosis.trim() }),
        ...(values.notes.trim() && { notes: values.notes.trim() }),
      }
  }
}

const kindLabels: Record<EventKind, string> = {
  observation: 'Beobachtung',
  problem: 'Problem',
  vet: 'Tierarzt',
}

export function EventForm({
  entry,
  initialKind = 'observation',
  saving,
  onSave,
  onCancel,
}: {
  entry?: FlockEvent
  initialKind?: EventKind
  saving: boolean
  onSave: (input: EventInput) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(() => ({
    ...valuesFor(entry),
    kind: entry?.kind ?? initialKind,
  }))
  const [errors, setErrors] = useState<EventFormErrors>({})
  const [message, setMessage] = useState('')

  function change<K extends keyof EventFormValues>(field: K, value: EventFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validateEventForm(values)
    setErrors(validation)
    const firstError = Object.keys(validation)[0] as keyof EventFormValues | undefined
    if (firstError) {
      document.getElementById(`event-${firstError}`)?.focus()
      return
    }
    setMessage('')
    try {
      await onSave(toInput(values))
    } catch {
      setMessage(
        'Das Ereignis konnte nicht gespeichert werden. Prüfe den lokalen Speicher und versuche es erneut.',
      )
    }
  }

  return (
    <Card as="div" className="documentation-form-card event-form-card">
      <h3>{entry ? 'Ereignis bearbeiten' : 'Ereignis hinzufügen'}</h3>
      <form data-guard-unsaved onSubmit={(event) => void submit(event)} noValidate>
        <div className="documentation-form-grid">
          {!entry && (
            <div className="form-field documentation-form-field--wide">
              <label htmlFor="event-kind">Art des Ereignisses</label>
              <select
                id="event-kind"
                value={values.kind}
                onChange={(event) => change('kind', event.target.value as EventKind)}
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {entry && (
            <p className="event-form-kind">
              Ereignisart: <strong>{kindLabels[entry.kind]}</strong>
            </p>
          )}
          <div className="form-field">
            <label htmlFor="event-date">Datum</label>
            <input
              id="event-date"
              type="date"
              required
              value={values.date}
              onChange={(event) => change('date', event.target.value)}
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? 'event-date-error' : undefined}
            />
            {errors.date && (
              <span id="event-date-error" className="form-field__error" role="alert">
                {errors.date}
              </span>
            )}
          </div>
          {values.kind !== 'observation' && (
            <div className="form-field">
              <label htmlFor="event-title">
                {values.kind === 'problem' ? 'Problem' : 'Anlass'}
              </label>
              <input
                id="event-title"
                type="text"
                required
                maxLength={120}
                value={values.title}
                onChange={(event) => change('title', event.target.value)}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'event-title-error' : undefined}
              />
              {errors.title && (
                <span id="event-title-error" className="form-field__error" role="alert">
                  {errors.title}
                </span>
              )}
            </div>
          )}
          {values.kind === 'observation' && (
            <div className="form-field">
              <label htmlFor="event-title">Überschrift (optional)</label>
              <input
                id="event-title"
                type="text"
                maxLength={120}
                value={values.title}
                onChange={(event) => change('title', event.target.value)}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'event-title-error' : undefined}
              />
              {errors.title && (
                <span id="event-title-error" className="form-field__error" role="alert">
                  {errors.title}
                </span>
              )}
            </div>
          )}
          {values.kind !== 'vet' && (
            <div className="form-field documentation-form-field--wide">
              <label htmlFor="event-description">
                {values.kind === 'problem' ? 'Beschreibung' : 'Beobachtung'}
              </label>
              <textarea
                id="event-description"
                rows={4}
                required
                maxLength={4000}
                value={values.description}
                onChange={(event) => change('description', event.target.value)}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? 'event-description-error' : undefined}
              />
              {errors.description && (
                <span id="event-description-error" className="form-field__error" role="alert">
                  {errors.description}
                </span>
              )}
            </div>
          )}
          {values.kind === 'vet' && (
            <div className="form-field documentation-form-field--wide">
              <label htmlFor="event-diagnosis">Diagnose (optional)</label>
              <textarea
                id="event-diagnosis"
                rows={3}
                maxLength={2000}
                value={values.diagnosis}
                onChange={(event) => change('diagnosis', event.target.value)}
                aria-invalid={Boolean(errors.diagnosis)}
                aria-describedby={errors.diagnosis ? 'event-diagnosis-error' : undefined}
              />
              {errors.diagnosis && (
                <span id="event-diagnosis-error" className="form-field__error" role="alert">
                  {errors.diagnosis}
                </span>
              )}
            </div>
          )}
          {values.kind !== 'observation' && (
            <div className="form-field documentation-form-field--wide">
              <label htmlFor="event-notes">Notizen (optional)</label>
              <textarea
                id="event-notes"
                rows={3}
                maxLength={2000}
                value={values.notes}
                onChange={(event) => change('notes', event.target.value)}
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={errors.notes ? 'event-notes-error' : undefined}
              />
              {errors.notes && (
                <span id="event-notes-error" className="form-field__error" role="alert">
                  {errors.notes}
                </span>
              )}
            </div>
          )}
        </div>
        {message && (
          <p role="alert" className="flock-message flock-message--error">
            {message}
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Wird gespeichert …' : entry ? 'Änderungen speichern' : 'Ereignis speichern'}
          </Button>
          <Button
            className="button--align-right"
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </Card>
  )
}
