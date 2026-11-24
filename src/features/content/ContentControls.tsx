import { Button } from '../../shared/components/Button'
import { isOnline } from './useContent'
import { dateLabel } from './contentDate'
import { ActivityProgress } from '../../shared/components/ActivityProgress'

export function SyncStatus({
  syncAt,
  skipped,
  syncing,
  error,
  onUpdate,
  count,
  label,
  syncingLabel,
}: {
  syncAt: string
  skipped: number
  syncing: boolean
  error: string
  onUpdate: () => void
  count: number
  label: string
  syncingLabel: string
}) {
  return (
    <div className="content-sync">
      <div aria-live="polite">
        <p>
          {syncing
            ? syncingLabel
            : count > 0
              ? `${count} ${label} verfügbar`
              : label === 'Pflanzen'
                ? 'Noch keine Pflanzenprofile vorhanden.'
                : 'Noch keine Artikel vorhanden.'}
        </p>
        {syncing && <ActivityProgress label="Synchronisierung läuft" />}
        {syncAt && <p>Zuletzt synchronisiert: {dateLabel(syncAt)}</p>}
      </div>
      {skipped > 0 && <p role="status">Übersprungene fehlerhafte Einträge: {skipped}.</p>}
      {error ? (
        <div className="content-sync__error" role="alert">
          <strong>Synchronisierung fehlgeschlagen</strong>
          <p>{error}</p>
          <Button
            type="button"
            variant="secondary"
            className={count === 0 ? 'content-sync__button--empty' : ''}
            onClick={onUpdate}
            disabled={syncing || !isOnline()}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className={count === 0 ? 'content-sync__button--empty' : ''}
          onClick={onUpdate}
          disabled={syncing || !isOnline()}
        >
          {syncing ? 'Wird synchronisiert …' : 'Jetzt aktualisieren'}
        </Button>
      )}
    </div>
  )
}
export function FavoriteFilterChip({
  active,
  onToggle,
}: {
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="content-favorite-filter"
      type="button"
      aria-pressed={active}
      onClick={onToggle}
    >
      <span aria-hidden="true">{active ? '★' : '☆'}</span> Nur Favoriten
    </button>
  )
}
