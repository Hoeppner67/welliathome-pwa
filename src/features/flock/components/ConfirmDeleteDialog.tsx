import { useRef } from 'react'
import { useDialogFocus } from '../../../shared/components/useDialogFocus'
import { Button } from '../../../shared/components/Button'

export function ConfirmDeleteDialog({
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useDialogFocus(dialogRef, cancelRef, true, onCancel, busy)

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
        aria-labelledby="record-delete-title"
        aria-describedby="record-delete-description"
      >
        <h2 id="record-delete-title">{title}</h2>
        <p id="record-delete-description">{description}</p>
        <div className="form-actions">
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Wird gelöscht …' : confirmLabel}
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
