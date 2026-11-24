import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BirdProfile, MediaAsset, NewEntity } from '../../../models'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { createId } from '../../../utils/id'
import { nowIsoTimestamp } from '../../../utils/date'
import { BirdAvatar } from '../components/BirdAvatar'
import {
  birdToFormValues,
  validateBirdForm,
  type BirdFormField,
  type BirdFormValues,
} from '../utils/birdFormValidation'
import { optimizeProfileImage } from '../utils/profileImage'

const labels: Record<BirdFormField, string> = {
  name: 'Name',
  gender: 'Geschlecht',
  hatchDate: 'Schlupfdatum',
  arrivalDate: 'Einzugsdatum',
  color: 'Farbschlag',
  ringNumber: 'Ringnummer',
  origin: 'Herkunft',
  notes: 'Notizen',
}
const limits: Partial<Record<BirdFormField, number>> = {
  name: 80,
  color: 80,
  ringNumber: 50,
  origin: 120,
  notes: 2000,
  hatchDate: 32,
  arrivalDate: 32,
}
export type ImageChange = NewEntity<MediaAsset> | null | undefined

export function BirdForm({
  bird,
  onSubmit,
}: {
  bird?: BirdProfile
  onSubmit: (values: BirdFormValues, image: ImageChange) => Promise<void>
}) {
  const navigate = useNavigate()
  const genderInfoDialog = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState(() => birdToFormValues(bird))
  const [errors, setErrors] = useState<Partial<Record<BirdFormField, string>>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [imageChange, setImageChange] = useState<ImageChange>(undefined)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState('')
  const original = useMemo(
    () => JSON.stringify({ values: birdToFormValues(bird), imageId: bird?.imageId ?? null }),
    [bird],
  )
  const dirty =
    JSON.stringify({
      values,
      imageId: imageChange === undefined ? (bird?.imageId ?? null) : (imageChange?.id ?? null),
      imageChange,
    }) !== original

  useEffect(() => {
    if (!previewBlob) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(previewBlob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [previewBlob])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function updateField(field: BirdFormField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function chooseImage(file?: File) {
    setImageError('')
    if (!file) return
    setImageBusy(true)
    try {
      const blob = await optimizeProfileImage(file)
      setPreviewBlob(blob)
      setImageChange({
        id: createId(),
        fileName: file.name || 'profilbild.webp',
        mimeType: blob.type || file.type,
        fileSize: blob.size,
        blob,
        createdAt: nowIsoTimestamp(),
        updatedAt: nowIsoTimestamp(),
      })
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : 'Das Bild konnte nicht verarbeitet werden.',
      )
    } finally {
      setImageBusy(false)
    }
  }

  function removeImage() {
    setPreviewBlob(null)
    setImageChange(null)
    setImageError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validateBirdForm(values)
    setErrors(validation)
    if (Object.keys(validation).length > 0) {
      document.getElementById(Object.keys(validation)[0])?.focus()
      return
    }
    if (imageBusy) return
    setSaving(true)
    setMessage('')
    try {
      await onSubmit(values, imageChange)
    } catch {
      setMessage(
        'Die Änderungen konnten nicht gespeichert werden. Prüfe den lokalen Speicher und versuche es erneut.',
      )
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (
      dirty &&
      !window.confirm('Deine Änderungen wurden noch nicht gespeichert. Seite trotzdem verlassen?')
    )
      return
    navigate('/schwarm')
  }

  const field = (name: BirdFormField, inputType = 'text') => (
    <div className="form-field" key={name}>
      <label htmlFor={name}>
        {labels[name]}
        {name === 'name' && <span aria-hidden="true"> *</span>}
      </label>
      {name === 'gender' ? (
        <div className="gender-select-row">
          <select
            id={name}
            value={values.gender}
            onChange={(event) => updateField(name, event.target.value)}
            aria-invalid={Boolean(errors.gender)}
            aria-describedby={errors.gender ? 'gender-error' : undefined}
          >
            <option value="">Nicht angegeben</option>
            <option value="male">Hahn</option>
            <option value="female">Henne</option>
            <option value="unknown">Unbekannt</option>
          </select>
          <button
            className="gender-info-button"
            type="button"
            aria-label="Informationen zur Geschlechtsbestimmung"
            aria-haspopup="dialog"
            onClick={() => genderInfoDialog.current?.showModal()}
          >
            <img src="/welli-icons/Info.svg" alt="" />
          </button>
        </div>
      ) : name === 'notes' ? (
        <textarea
          id={name}
          rows={5}
          maxLength={limits[name]}
          value={values[name]}
          onChange={(event) => updateField(name, event.target.value)}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        />
      ) : (
        <input
          id={name}
          type={inputType}
          maxLength={limits[name]}
          value={values[name]}
          required={name === 'name'}
          onChange={(event) => updateField(name, event.target.value)}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        />
      )}
      {errors[name] && (
        <span className="form-field__error" id={`${name}-error`} role="alert">
          {errors[name]}
        </span>
      )}
    </div>
  )

  return (
    <section className="bird-form-page" aria-labelledby="bird-form-title">
      <Card className="bird-form-card">
        <p className="eyebrow">Mein Schwarm</p>
        <h1 id="bird-form-title">{bird ? 'Profil bearbeiten' : 'Vogel erfassen'}</h1>
        <p className="bird-form-card__intro">
          Die Angaben werden nur auf diesem Gerät gespeichert.
        </p>
        <form data-guard-unsaved onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className="bird-form-grid">
            {field('name')}
            {field('gender')}
            {field('hatchDate')}
            {field('arrivalDate')}
            {field('color')}
            {field('ringNumber')}
            {field('origin')}
            <div className="form-field form-field--wide">{field('notes')}</div>
          </div>
          <fieldset className="image-picker">
            <legend>Profilbild (optional)</legend>
            <div className="image-picker__row">
              {previewBlob ? (
                <span className="bird-avatar bird-avatar--large">
                  <img src={previewUrl ?? undefined} alt="Vorschau des ausgewählten Profilbilds" />
                </span>
              ) : (
                <BirdAvatar
                  imageId={imageChange === null ? undefined : bird?.imageId}
                  name={(bird?.name ?? values.name) || 'Vogel'}
                  className="bird-avatar--large"
                />
              )}
              <div className="image-picker__controls">
                <label className="button button--secondary image-picker__label">
                  {imageChange === undefined && bird?.imageId ? 'Bild ändern' : 'Bild auswählen'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="Profilbild auswählen"
                    onChange={(event) => {
                      void chooseImage(event.currentTarget.files?.[0])
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
                {(bird?.imageId || imageChange) && (
                  <Button type="button" variant="secondary" onClick={removeImage}>
                    Bild entfernen
                  </Button>
                )}
                <span className="form-hint">JPEG, PNG oder WebP · maximal 12 MB</span>
                {imageBusy && <span role="status">Bild wird vorbereitet …</span>}
                {imageError && (
                  <span role="alert" className="form-field__error">
                    {imageError}
                  </span>
                )}
              </div>
            </div>
          </fieldset>
          {message && (
            <p className="flock-message flock-message--error" role="alert">
              {message}
            </p>
          )}
          <div className="form-actions">
            <Button type="submit" disabled={saving || imageBusy}>
              {saving ? 'Wird gespeichert …' : bird ? 'Änderungen speichern' : 'Vogel speichern'}
            </Button>
            <Button
              className="button--align-right"
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={cancel}
            >
              Abbrechen
            </Button>
          </div>
        </form>
        <dialog
          ref={genderInfoDialog}
          className="gender-info-dialog"
          aria-labelledby="gender-info-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              genderInfoDialog.current?.close()
            }
          }}
        >
          <div className="gender-info-dialog__header">
            <h2 id="gender-info-title">Geschlechtsbestimmung</h2>
            <button
              className="gender-info-dialog__close"
              type="button"
              aria-label="Schließen"
              title="Schließen"
              autoFocus
              onClick={() => genderInfoDialog.current?.close()}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M5 5l14 14M19 5 5 19" />
              </svg>
            </button>
          </div>
          <img
            src="/images/geschlechtsbestimmung.webp"
            alt="Beispiele für die Wachshaut von Hähnen und Hennen bei Wellensittichen"
          />
        </dialog>
      </Card>
    </section>
  )
}
