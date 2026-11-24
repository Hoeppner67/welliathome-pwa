import { useMemo, useState } from 'react'
import type { FeedMix, NewEntity } from '../../../models'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { FeedMixCard } from '../components/FeedMixCard'
import { FeedMixForm } from '../components/FeedMixForm'
import { DeleteFeedMixDialog } from '../components/DeleteFeedMixDialog'
import { useFeedMixes } from '../hooks/useFeedMixes'
import { matchesFeedMix } from '../utils/feedMixForm'
import '../../../styles/feedMixes.css'

export function FeedMixesPage() {
  const { mixes, loading, error, refresh, create, update, remove } = useFeedMixes()
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FeedMix | undefined>()
  const [deleting, setDeleting] = useState<FeedMix | undefined>()
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const sorted = useMemo(
    () =>
      mixes
        .map((mix, index) => ({ mix, index }))
        .sort(
          (a, b) =>
            a.mix.name.localeCompare(b.mix.name, 'de-DE', { sensitivity: 'base' }) ||
            a.index - b.index,
        )
        .map((entry) => entry.mix),
    [mixes],
  )
  const visible = useMemo(() => sorted.filter((mix) => matchesFeedMix(mix, query)), [sorted, query])

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
    setActionError('')
    setNotice('')
  }

  function openEdit(mix: FeedMix) {
    setEditing(mix)
    setFormOpen(true)
    setActionError('')
    setNotice('')
  }

  async function save(input: NewEntity<FeedMix>) {
    if (editing) await update(editing.id, input)
    else await create(input)
    setFormOpen(false)
    setEditing(undefined)
    setNotice(editing ? 'Körnermischung wurde geändert.' : 'Körnermischung wurde gespeichert.')
    setActionError('')
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setActionError('')
    setNotice('')
    try {
      await remove(deleting.id)
      setDeleting(undefined)
      setNotice('Körnermischung wurde gelöscht.')
    } catch {
      setDeleting(undefined)
      setActionError(
        'Die Körnermischung konnte nicht gelöscht werden. Prüfe den lokalen Speicher und versuche es erneut.',
      )
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section className="feed-mixes-page" aria-labelledby="feed-mixes-title">
      <header className="page-intro">
        <h1 id="feed-mixes-title">Körnermischungen</h1>
        <p className="page-intro__copy">Futter verwalten und bestellen</p>
      </header>

      {notice && (
        <p className="flock-message flock-message--success" role="status">
          {notice}
        </p>
      )}
      {(error || actionError) && (
        <div className="flock-message flock-message--error" role="alert">
          <p>{error || actionError}</p>
          {error && (
            <Button type="button" variant="secondary" onClick={() => void refresh()}>
              Erneut versuchen
            </Button>
          )}
        </div>
      )}

      <section className="feed-mixes-section" aria-labelledby="feed-mixes-title">
        <div className="feed-mixes-section__heading feed-mixes-section__heading--actions">
          <Button
            type="button"
            className="add-button"
            aria-label="Körnermischung hinzufügen"
            onClick={openCreate}
          >
            <img src="/welli-icons/add.svg" alt="" />
          </Button>
        </div>
        {formOpen && (
          <FeedMixForm
            key={editing?.id ?? 'new'}
            mix={editing}
            onSave={save}
            onCancel={() => {
              setFormOpen(false)
              setEditing(undefined)
            }}
          />
        )}

        <div className="feed-mixes-search">
          <label htmlFor="feed-mixes-search">Körnermischung suchen</label>
          <input
            id="feed-mixes-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {loading ? (
          <p role="status">Körnermischungen werden geladen …</p>
        ) : visible.length > 0 ? (
          <div className="feed-mixes-grid">
            {visible.map((mix) => (
              <FeedMixCard
                key={mix.id}
                mix={mix}
                onEdit={openEdit}
                onDelete={(mix) => setDeleting(mix)}
              />
            ))}
          </div>
        ) : mixes.length === 0 ? (
          <Card className="feed-mixes-empty">
            <h2>Noch keine Körnermischungen gespeichert.</h2>
            <Button type="button" onClick={openCreate}>
              Erste Körnermischung hinzufügen
            </Button>
          </Card>
        ) : (
          <p className="feed-mixes-no-results">Keine Körnermischungen für „{query}“ gefunden.</p>
        )}
      </section>
      {deleting && (
        <DeleteFeedMixDialog
          name={deleting.name}
          busy={deleteBusy}
          onCancel={() => setDeleting(undefined)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </section>
  )
}
