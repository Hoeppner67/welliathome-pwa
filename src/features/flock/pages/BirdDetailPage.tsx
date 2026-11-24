import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  birdRepository,
  BirdDeletePreviewChangedError,
  type BirdDependentRecordCounts,
} from '../../../data/repositories'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { BirdAvatar } from '../components/BirdAvatar'
import { genderLabel } from '../utils/genderLabel'
import { useBird } from '../hooks/useBird'
import { DeleteBirdDialog } from './DeleteBirdDialog'
import { WeightSection } from '../components/WeightSection'
import { MedicationSection } from '../components/MedicationSection'
import { EventSection } from '../components/EventSection'
import { TimelineSection } from '../components/TimelineSection'

export function BirdDetailPage() {
  const { birdId } = useParams()
  const { bird, loading, error } = useBird(birdId)
  const navigate = useNavigate()
  const location = useLocation()
  const [timelineRevision, setTimelineRevision] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadingDeletePreview, setLoadingDeletePreview] = useState(false)
  const [deletePreview, setDeletePreview] = useState<BirdDependentRecordCounts>()
  const [deleteError, setDeleteError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const notice = (location.state as { notice?: string } | null)?.notice

  if (loading) return <p role="status">Profil wird geladen …</p>
  if (error)
    return (
      <section className="flock-message flock-message--error" role="alert">
        <h1>Profil nicht verfügbar</h1>
        <p>{error}</p>
      </section>
    )
  if (!bird)
    return (
      <section className="flock-message">
        <h1>Vogelprofil nicht gefunden</h1>
        <p>Dieses Profil ist nicht mehr vorhanden.</p>
        <Link to="/schwarm">Zurück zu Mein Schwarm</Link>
      </section>
    )

  const birdIdToDelete = bird.id

  async function openDeleteDialog() {
    setConfirmDelete(true)
    setDeletePreview(undefined)
    setDeleteError('')
    setLoadingDeletePreview(true)
    try {
      setDeletePreview(await birdRepository.getDependentRecordCounts(birdIdToDelete))
    } catch {
      setDeleteError(
        'Zugehörige Einträge konnten nicht ermittelt werden. Bitte schließe den Dialog und versuche es erneut.',
      )
    } finally {
      setLoadingDeletePreview(false)
    }
  }

  async function downloadPdf() {
    setExporting(true)
    setMessage('')
    try {
      const { exportBirdPdf } = await import('../services/birdPdf')
      await exportBirdPdf(birdIdToDelete)
    } catch (cause) {
      setMessage(
        cause instanceof Error && cause.name === 'PdfUnsupportedCharactersError'
          ? cause.message
          : 'Das PDF konnte nicht erstellt werden. Bitte versuche es erneut.',
      )
    } finally {
      setExporting(false)
    }
  }

  async function deleteBird() {
    if (!deletePreview) return
    setDeleting(true)
    setDeleteError('')
    try {
      const deleted = await birdRepository.deleteWithRelatedData(birdIdToDelete, deletePreview)
      if (!deleted) {
        setConfirmDelete(false)
        setMessage('Das Vogelprofil ist nicht mehr vorhanden.')
        return
      }
      navigate('/schwarm', { replace: true, state: { notice: 'Vogelprofil wurde gelöscht.' } })
    } catch (cause) {
      if (cause instanceof BirdDeletePreviewChangedError) {
        setDeletePreview(cause.currentCounts)
        setDeleteError(
          'Seit der Vorschau haben sich zugehörige Einträge geändert. Prüfe die aktualisierte Auflistung und bestätige erneut.',
        )
      } else {
        setDeleteError(
          'Das Vogelprofil konnte nicht gelöscht werden. Bitte prüfe den lokalen Speicher und versuche es erneut.',
        )
      }
    } finally {
      setDeleting(false)
    }
  }

  const details = [
    ['Geschlecht', bird.gender ? genderLabel(bird.gender) : undefined],
    ['Schlupfdatum', bird.hatchDate ? formatDate(bird.hatchDate) : undefined],
    ['Einzugsdatum', bird.arrivalDate ? formatDate(bird.arrivalDate) : undefined],
    ['Farbschlag', bird.color],
    ['Ringnummer', bird.ringNumber],
    ['Herkunft', bird.origin],
    ['Notizen', bird.notes],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))

  return (
    <section className="bird-detail-page" aria-labelledby="bird-title">
      {notice && (
        <p className="flock-message flock-message--success" role="status">
          {notice}
        </p>
      )}
      {message && (
        <p className="flock-message flock-message--error" role="alert">
          {message}
        </p>
      )}
      <Card className="bird-detail-hero">
        <BirdAvatar imageId={bird.imageId} name={bird.name} className="bird-avatar--hero" />
        <div>
          <p className="eyebrow">Vogelprofil</p>
          <h1 id="bird-title">{bird.name}</h1>
          {(bird.gender || bird.color) && (
            <p className="bird-detail-hero__meta">
              {[bird.gender && genderLabel(bird.gender), bird.color].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          className="bird-pdf-button"
          type="button"
          onClick={() => void downloadPdf()}
          disabled={exporting}
          aria-label="Tierarzt-Dokumentaion erstellen"
          title="Tierarzt-Dokumentaion erstellen"
        >
          <img src="/welli-icons/pdf.svg" alt="" />
        </button>
        <div className="bird-detail-actions">
          <div className="bird-detail-actions__group">
            <Link
              className="button button--primary"
              to={`/schwarm/${encodeURIComponent(bird.id)}/bearbeiten`}
            >
              Profil bearbeiten
            </Link>
            <Button type="button" variant="secondary" onClick={() => void openDeleteDialog()}>
              Profil löschen
            </Button>
          </div>
        </div>
      </Card>
      <Card className="bird-information">
        <h2>Profilinformationen</h2>
        <dl>
          {details.map(([label, value]) => (
            <div className="bird-information__row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <WeightSection bird={bird} />
      <MedicationSection
        birdId={bird.id}
        onDataChanged={() => setTimelineRevision((value) => value + 1)}
      />
      <EventSection
        birdId={bird.id}
        onDataChanged={() => setTimelineRevision((value) => value + 1)}
      />
      <TimelineSection birdId={bird.id} refreshToken={timelineRevision} />
      {confirmDelete && (
        <DeleteBirdDialog
          name={bird.name}
          busy={deleting}
          loadingPreview={loadingDeletePreview}
          dependentCounts={deletePreview}
          error={deleteError}
          onCancel={() => {
            setConfirmDelete(false)
            setDeleteError('')
          }}
          onConfirm={() => void deleteBird()}
        />
      )}
    </section>
  )
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}
