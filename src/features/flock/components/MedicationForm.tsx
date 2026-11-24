import { useState, type FormEvent } from 'react'
import type { Medication } from '../../../models'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import {
  validateMedicationForm,
  type MedicationFormErrors,
  type MedicationFormValues,
} from '../utils/medicationValidation'
import type { MedicationInput } from '../services/documentationService'

const valuesFor = (entry?: Medication): MedicationFormValues => ({
  name: entry?.name ?? '',
  dosage: entry?.dosage ?? '',
  startDate: entry?.startDate ?? '',
  endDate: entry?.endDate ?? '',
  notes: entry?.notes ?? '',
})

export function MedicationForm({
  entry,
  saving,
  onSave,
  onCancel,
}: {
  entry?: Medication
  saving: boolean
  onSave: (values: MedicationInput) => Promise<void>
  onCancel?: () => void
}) {
  const [values, setValues] = useState(() => valuesFor(entry))
  const [errors, setErrors] = useState<MedicationFormErrors>({})
  const [message, setMessage] = useState('')
  function change(field: keyof MedicationFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validateMedicationForm(values)
    setErrors(validation)
    if (Object.keys(validation).length) {
      document.getElementById(`medication-${Object.keys(validation)[0]}`)?.focus()
      return
    }
    setMessage('')
    try {
      await onSave({
        name: values.name.trim(),
        ...(values.dosage.trim() && { dosage: values.dosage.trim() }),
        startDate: values.startDate,
        ...(values.endDate && { endDate: values.endDate }),
        ...(values.notes.trim() && { notes: values.notes.trim() }),
      })
      if (!entry) setValues(valuesFor())
    } catch {
      setMessage(
        'Der Medikamenteneintrag konnte nicht gespeichert werden. Prüfe den lokalen Speicher und versuche es erneut.',
      )
    }
  }
  return (
    <Card as="div" className="documentation-form-card">
      {entry && <h3>Medikament bearbeiten</h3>}
      <form data-guard-unsaved onSubmit={(event) => void submit(event)} noValidate>
        <div className="documentation-form-grid">
          <div className="form-field documentation-form-field--wide">
            <label htmlFor="medication-name">Medikament</label>
            <input
              id="medication-name"
              type="text"
              required
              maxLength={120}
              value={values.name}
              onChange={(event) => change('name', event.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'medication-name-error' : undefined}
            />
            {errors.name && (
              <span id="medication-name-error" role="alert" className="form-field__error">
                {errors.name}
              </span>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="medication-dosage">Dosierung / Menge (optional)</label>
            <input
              id="medication-dosage"
              type="text"
              maxLength={120}
              value={values.dosage}
              onChange={(event) => change('dosage', event.target.value)}
              aria-invalid={Boolean(errors.dosage)}
              aria-describedby={errors.dosage ? 'medication-dosage-error' : undefined}
            />
            {errors.dosage && (
              <span id="medication-dosage-error" role="alert" className="form-field__error">
                {errors.dosage}
              </span>
            )}
          </div>
          <div className="medication-date-fields documentation-form-field--wide">
            <div className="form-field">
              <label htmlFor="medication-startDate">Beginn</label>
              <input
                id="medication-startDate"
                type="date"
                required
                value={values.startDate}
                onChange={(event) => change('startDate', event.target.value)}
                aria-invalid={Boolean(errors.startDate)}
                aria-describedby={errors.startDate ? 'medication-startDate-error' : undefined}
              />
              {errors.startDate && (
                <span id="medication-startDate-error" role="alert" className="form-field__error">
                  {errors.startDate}
                </span>
              )}
            </div>
            <div className="form-field">
              <label htmlFor="medication-endDate">Ende (optional)</label>
              <input
                id="medication-endDate"
                type="date"
                value={values.endDate}
                onChange={(event) => change('endDate', event.target.value)}
                aria-invalid={Boolean(errors.endDate)}
                aria-describedby={errors.endDate ? 'medication-endDate-error' : undefined}
              />
              {errors.endDate && (
                <span id="medication-endDate-error" role="alert" className="form-field__error">
                  {errors.endDate}
                </span>
              )}
            </div>
          </div>
          <div className="form-field documentation-form-field--wide">
            <label htmlFor="medication-notes">Notizen (optional)</label>
            <textarea
              id="medication-notes"
              rows={3}
              maxLength={2000}
              value={values.notes}
              onChange={(event) => change('notes', event.target.value)}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? 'medication-notes-error' : undefined}
            />
            {errors.notes && (
              <span id="medication-notes-error" role="alert" className="form-field__error">
                {errors.notes}
              </span>
            )}
          </div>
        </div>
        {message && (
          <p role="alert" className="flock-message flock-message--error">
            {message}
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" disabled={saving}>
            {saving
              ? 'Wird gespeichert …'
              : entry
                ? 'Änderungen speichern'
                : 'Medikament speichern'}
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
