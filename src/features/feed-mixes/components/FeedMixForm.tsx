import { useState, type FormEvent } from 'react'
import type { FeedMix } from '../../../models'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import {
  feedMixToFormValues,
  toFeedMixUpdate,
  toNewFeedMix,
  validateFeedMixForm,
  type FeedMixFormErrors,
  type FeedMixFormField,
} from '../utils/feedMixForm'

export function FeedMixForm({
  mix,
  onSave,
  onCancel,
}: {
  mix?: FeedMix
  onSave: (input: ReturnType<typeof toNewFeedMix>) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(() => feedMixToFormValues(mix))
  const [errors, setErrors] = useState<FeedMixFormErrors>({})
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')

  function update(field: FeedMixFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateFeedMixForm(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus()
      return
    }

    setSaving(true)
    setSubmitError('')
    try {
      await onSave(mix ? toFeedMixUpdate(values) : toNewFeedMix(values))
    } catch {
      setSubmitError(
        'Die Körnermischung konnte nicht gespeichert werden. Prüfe den lokalen Speicher und versuche es erneut.',
      )
    } finally {
      setSaving(false)
    }
  }

  function field(
    name: FeedMixFormField,
    label: string,
    options: {
      multiline?: boolean
      type?: string
      required?: boolean
      hint?: string
      placeholder?: string
      maxLength?: number
    } = {},
  ) {
    const errorId = `${name}-error`
    const hintId = `${name}-hint`
    return (
      <div className="form-field" key={name}>
        <label htmlFor={name}>
          {label}
          {options.required && <span aria-hidden="true"> *</span>}
        </label>
        {options.multiline ? (
          <textarea
            id={name}
            rows={name === 'ingredientsText' ? 6 : 4}
            value={values[name]}
            maxLength={options.maxLength}
            placeholder={options.placeholder}
            onChange={(event) => update(name, event.target.value)}
            aria-invalid={Boolean(errors[name])}
            aria-describedby={
              [options.hint ? hintId : '', errors[name] ? errorId : ''].filter(Boolean).join(' ') ||
              undefined
            }
          />
        ) : (
          <input
            id={name}
            type={options.type ?? 'text'}
            value={values[name]}
            maxLength={options.maxLength}
            placeholder={options.placeholder}
            required={options.required}
            onChange={(event) => update(name, event.target.value)}
            aria-invalid={Boolean(errors[name])}
            aria-describedby={
              [options.hint ? hintId : '', errors[name] ? errorId : ''].filter(Boolean).join(' ') ||
              undefined
            }
          />
        )}
        {options.hint && (
          <span className="form-hint" id={hintId}>
            {options.hint}
          </span>
        )}
        {errors[name] && (
          <span className="form-field__error" id={errorId} role="alert">
            {errors[name]}
          </span>
        )}
      </div>
    )
  }

  return (
    <Card className="feed-mix-form-card">
      <h2>{mix ? 'Körnermischung bearbeiten' : 'Körnermischung hinzufügen'}</h2>
      <form
        className="feed-mix-form"
        data-guard-unsaved
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        {field('name', 'Name der Körnermischung', { required: true, maxLength: 120 })}
        {field('provider', 'Anbieter / Hersteller', { maxLength: 120 })}
        <div className="form-field form-field--wide">
          {field('ingredientsText', 'Zusammensetzung', {
            multiline: true,
            placeholder: 'Kanariensaat\nSilberhirse\nJapanhirse\nHafer',
            hint: 'Jede Zutat in eine eigene Zeile schreiben.',
            maxLength: 4000,
          })}
        </div>
        <div className="form-field form-field--wide">
          {field('productUrl', 'Produkt- / Bestelllink', {
            type: 'url',
            placeholder: 'https://beispiel.de/produkt',
            maxLength: 2048,
          })}
        </div>
        <div className="form-field form-field--wide">
          {field('notes', 'Notizen', { multiline: true, maxLength: 2000 })}
        </div>
        {submitError && (
          <p className="flock-message flock-message--error feed-mix-form__error" role="alert">
            {submitError}
          </p>
        )}
        <div className="form-actions form-field--wide">
          <Button type="submit" disabled={saving}>
            {saving
              ? 'Wird gespeichert …'
              : mix
                ? 'Änderungen speichern'
                : 'Körnermischung speichern'}
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
