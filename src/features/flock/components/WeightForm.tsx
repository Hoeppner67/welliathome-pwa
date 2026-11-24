import { useState, type FormEvent } from 'react'
import type { WeightEntry } from '../../../models'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { localIsoDate } from '../../../utils/date'
import { parseWeight, validateWeightForm, type WeightFormValues } from '../utils/weightValidation'

const initialValues = (entry?: WeightEntry): WeightFormValues => ({
  date: entry?.date ?? localIsoDate(),
  weight: entry ? String(entry.weight).replace('.', ',') : '',
  notes: entry?.notes ?? '',
})

export function WeightForm({
  entry,
  saving,
  onSave,
  onCancel,
}: {
  entry?: WeightEntry
  saving: boolean
  onSave: (value: { date: string; weight: number; notes?: string }) => Promise<void>
  onCancel?: () => void
}) {
  const [values, setValues] = useState(() => initialValues(entry))
  const [errors, setErrors] = useState<Partial<Record<keyof WeightFormValues, string>>>({})
  const [message, setMessage] = useState('')

  function change(field: keyof WeightFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validateWeightForm(values)
    setErrors(validation)
    if (Object.keys(validation).length) {
      document.getElementById(`weight-${Object.keys(validation)[0]}`)?.focus()
      return
    }
    const weight = parseWeight(values.weight)
    if (weight === undefined) return
    setMessage('')
    try {
      await onSave({
        date: values.date,
        weight,
        ...(values.notes.trim() && { notes: values.notes.trim() }),
      })
      if (!entry) setValues({ date: localIsoDate(), weight: '', notes: '' })
    } catch {
      setMessage(
        'Der Gewichtseintrag konnte nicht gespeichert werden. Prüfe den lokalen Speicher und versuche es erneut.',
      )
    }
  }

  return (
    <Card as="div" className="documentation-form-card">
      {entry && <h3>Gewichtseintrag bearbeiten</h3>}
      <form data-guard-unsaved onSubmit={(event) => void submit(event)} noValidate>
        <div className="documentation-form-grid">
          <div className="form-field">
            <label htmlFor="weight-date">Datum</label>
            <input
              id="weight-date"
              type="date"
              required
              value={values.date}
              onChange={(event) => change('date', event.target.value)}
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? 'weight-date-error' : undefined}
            />
            {errors.date && (
              <span id="weight-date-error" className="form-field__error" role="alert">
                {errors.date}
              </span>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="weight-weight">Gewicht (g)</label>
            <input
              id="weight-weight"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              required
              maxLength={12}
              value={values.weight}
              onChange={(event) => change('weight', event.target.value)}
              aria-invalid={Boolean(errors.weight)}
              aria-describedby={errors.weight ? 'weight-value-error' : undefined}
            />
            {errors.weight && (
              <span id="weight-value-error" className="form-field__error" role="alert">
                {errors.weight}
              </span>
            )}
          </div>
          <div className="form-field documentation-form-field--wide">
            <label htmlFor="weight-notes">Notizen (optional)</label>
            <textarea
              id="weight-notes"
              rows={3}
              maxLength={2000}
              value={values.notes}
              onChange={(event) => change('notes', event.target.value)}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? 'weight-notes-error' : undefined}
            />
            {errors.notes && (
              <span id="weight-notes-error" className="form-field__error" role="alert">
                {errors.notes}
              </span>
            )}
          </div>
        </div>
        {message && (
          <p className="flock-message flock-message--error" role="alert">
            {message}
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Wird gespeichert …' : entry ? 'Änderungen speichern' : 'Gewicht speichern'}
          </Button>
          {entry && onCancel && (
            <Button
              className="button--align-right"
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={onCancel}
            >
              Abbrechen
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}
