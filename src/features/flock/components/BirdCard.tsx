import { Link } from 'react-router-dom'
import type { BirdProfile } from '../../../models'
import { Card } from '../../../shared/components/Card'
import { BirdAvatar } from './BirdAvatar'
import { genderLabel } from '../utils/genderLabel'

export function BirdCard({ bird }: { bird: BirdProfile }) {
  return (
    <Card className="bird-card">
      <BirdAvatar imageId={bird.imageId} name={bird.name} />
      <div className="bird-card__body">
        <h2>{bird.name}</h2>
        {(bird.gender || bird.color) && (
          <p>{[bird.gender && genderLabel(bird.gender), bird.color].filter(Boolean).join(' · ')}</p>
        )}
      </div>
      <Link className="button button--primary" to={`/schwarm/${encodeURIComponent(bird.id)}`}>
        Profil öffnen
      </Link>
    </Card>
  )
}
