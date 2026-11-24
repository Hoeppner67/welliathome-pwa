import { Link, useNavigate, useParams } from 'react-router-dom'
import { birdRepository } from '../../../data/repositories'
import { useBird } from '../hooks/useBird'
import { BirdForm } from './BirdForm'
import { valuesToBirdInput, type BirdFormValues } from '../utils/birdFormValidation'
import type { MediaAsset } from '../../../models'

export function BirdEditPage() {
  const { birdId } = useParams()
  const navigate = useNavigate()
  const { bird, loading, error } = useBird(birdId)
  if (loading) return <p role="status">Profil wird geladen …</p>
  if (error)
    return (
      <section className="flock-message flock-message--error" role="alert">
        <h1>Profil nicht verfügbar</h1>
        <p>{error}</p>
        <Link to="/schwarm">Zurück zu Mein Schwarm</Link>
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

  const existingBird = bird
  async function save(values: BirdFormValues, image: import('./BirdForm').ImageChange) {
    const input = valuesToBirdInput(values)
    const updated =
      image === undefined
        ? await birdRepository.update(existingBird.id, input)
        : await birdRepository.updateWithImage(existingBird.id, input, image as MediaAsset | null)
    if (!updated) throw new Error('Profil nicht gefunden')
    navigate(`/schwarm/${encodeURIComponent(existingBird.id)}`, {
      replace: true,
      state: { notice: 'Änderungen wurden gespeichert.' },
    })
  }
  return <BirdForm bird={existingBird} onSubmit={save} />
}
