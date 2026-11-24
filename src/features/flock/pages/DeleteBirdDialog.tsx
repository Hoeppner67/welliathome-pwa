import { useRef } from 'react'
import { useDialogFocus } from '../../../shared/components/useDialogFocus'
import { Button } from '../../../shared/components/Button'
import type { BirdDependentRecordCounts } from '../../../data/repositories'

const dependentCategories: { key: keyof BirdDependentRecordCounts; label: string }[] = [
  { key: 'medications', label: 'Medikamente' },
  { key: 'weights', label: 'Gewichtseinträge' },
  { key: 'observations', label: 'Beobachtungen' },
  { key: 'healthEvents', label: 'Gesundheitsereignisse' },
  { key: 'vetAppointments', label: 'Tierarzttermine' },
  { key: 'reminders', label: 'Erinnerungen' },
]

export function DeleteBirdDialog({
  name,
  busy,
  loadingPreview,
  dependentCounts,
  error,
  onCancel,
  onConfirm,
}: {
  name: string
  busy: boolean
  loadingPreview: boolean
  dependentCounts?: BirdDependentRecordCounts
  error: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useDialogFocus(dialogRef, cancelRef, true, onCancel, busy)
  const dependentTotal = dependentCounts
    ? Object.values(dependentCounts).reduce((total, count) => total + count, 0)
    : 0

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-copy"
      >
        <h2 id="delete-dialog-title">Vogelprofil löschen?</h2>
        <p id="delete-dialog-copy">
          Das Profil von „{name}“ und alle zugehörigen Daten werden endgültig gelöscht. Diese Aktion
          kann nicht rückgängig gemacht werden.
        </p>
        {loadingPreview && <p role="status">Zugehörige Einträge werden ermittelt …</p>}
        {dependentCounts && (
          <div className="delete-dialog__preview">
            <h3>Betroffene Daten</h3>
            {dependentTotal > 0 ? (
              <dl>
                {dependentCategories
                  .filter(({ key }) => dependentCounts[key] > 0)
                  .map(({ key, label }) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{dependentCounts[key]}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p>Keine zugehörigen Einträge vorhanden.</p>
            )}
            <p>Anzahl zugehöriger Einträge: {dependentTotal}</p>
            <p>
              Das Profilbild wird entfernt, sofern es nicht von einem anderen Profil verwendet wird.
            </p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          <Button
            type="button"
            disabled={busy || loadingPreview || !dependentCounts}
            onClick={onConfirm}
          >
            {busy ? 'Wird endgültig gelöscht …' : 'Profil und Daten löschen'}
          </Button>
          <Button
            className="button--align-right"
            ref={cancelRef}
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Abbrechen
          </Button>
        </div>
      </section>
    </div>
  )
}
