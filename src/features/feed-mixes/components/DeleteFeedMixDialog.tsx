import { useRef } from 'react'
import { useDialogFocus } from '../../../shared/components/useDialogFocus'
import { Button } from '../../../shared/components/Button'

export function DeleteFeedMixDialog({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string
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
        aria-labelledby="feed-mix-delete-title"
        aria-describedby="feed-mix-delete-copy"
      >
        <h2 id="feed-mix-delete-title">Körnermischung löschen?</h2>
        <p id="feed-mix-delete-copy">
          Möchtest du diese Körnermischung wirklich löschen? Diese Aktion kann nicht rückgängig
          gemacht werden.
        </p>
        <p>
          <strong>{name}</strong>
        </p>
        <div className="form-actions">
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Wird gelöscht …' : 'Körnermischung löschen'}
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
