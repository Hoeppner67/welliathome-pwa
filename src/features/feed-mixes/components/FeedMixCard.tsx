import { Fragment, useState } from 'react'
import type { FeedMix } from '../../../models'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { SafeLink } from '../../../shared/components/SafeLink'
import { Icon } from '../../../shared/components/Icon'
import { isHttpUrl } from '../utils/feedMixForm'

const DISCOUNT_CODE = 'Welli@Home10'

export function FeedMixCard({
  mix,
  onEdit,
  onDelete,
}: {
  mix: FeedMix
  onEdit: (mix: FeedMix) => void
  onDelete: (mix: FeedMix) => void
}) {
  const [copyMessage, setCopyMessage] = useState('')
  const hasDiscountCode = Boolean(mix.notes?.includes(DISCOUNT_CODE))

  async function copyDiscountCode() {
    try {
      await navigator.clipboard.writeText(DISCOUNT_CODE)
      setCopyMessage('Rabattcode kopiert')
    } catch {
      setCopyMessage('Der Rabattcode konnte nicht kopiert werden.')
    }
  }

  return (
    <Card className="feed-mix-card">
      <div className="feed-mix-card__heading">
        <h2>{mix.name}</h2>
        {mix.provider && <p>{mix.provider}</p>}
      </div>
      {mix.ingredients.length > 0 && (
        <div className="feed-mix-card__section">
          <h3>Zusammensetzung</h3>
          <ul>
            {mix.ingredients.map((ingredient, index) => (
              <li key={`${index}-${ingredient}`}>{ingredient}</li>
            ))}
          </ul>
        </div>
      )}
      {mix.notes && (
        <div className="feed-mix-card__notes">
          <p>
            {mix.notes.split(DISCOUNT_CODE).map((part, index, parts) => (
              <Fragment key={index}>
                {part}
                {index < parts.length - 1 && <strong>{DISCOUNT_CODE}</strong>}
              </Fragment>
            ))}
          </p>
          {hasDiscountCode && (
            <>
              <Button
                type="button"
                variant="secondary"
                className="feed-mix-card__copy"
                aria-label="Rabattcode kopieren"
                title="Rabattcode kopieren"
                onClick={() => void copyDiscountCode()}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                  <path d="M8 8V4.75A1.75 1.75 0 0 1 9.75 3h9.5A1.75 1.75 0 0 1 21 4.75v11.5A1.75 1.75 0 0 1 19.25 18H16v1.25A1.75 1.75 0 0 1 14.25 21h-9.5A1.75 1.75 0 0 1 3 19.25v-9.5A1.75 1.75 0 0 1 4.75 8H8Zm0 2H4.75a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V18h-4.75A1.75 1.75 0 0 1 8 16.25V10Zm1.75-5a.25.25 0 0 0-.25.25v11.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V4.75a.25.25 0 0 0-.25-.25h-9.5Z" />
                </svg>
              </Button>
              <span className="feed-mix-card__copy-status" role="status" aria-live="polite">
                {copyMessage}
              </span>
            </>
          )}
        </div>
      )}
      <div className="feed-mix-card__actions">
        {mix.productUrl && isHttpUrl(mix.productUrl) && (
          <SafeLink className="button button--primary" href={mix.productUrl}>
            Bestellen
          </SafeLink>
        )}
        <Button
          type="button"
          variant="secondary"
          className="feed-mix-card__icon-button"
          aria-label={`Bearbeiten: ${mix.name}`}
          title="Bearbeiten"
          onClick={() => onEdit(mix)}
        >
          <Icon name="edit" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="feed-mix-card__icon-button"
          aria-label={`Löschen: ${mix.name}`}
          title="Löschen"
          onClick={() => onDelete(mix)}
        >
          <Icon name="delete" />
        </Button>
      </div>
    </Card>
  )
}
