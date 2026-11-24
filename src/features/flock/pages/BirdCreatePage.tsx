import { useNavigate } from 'react-router-dom'
import type { MediaAsset } from '../../../models'
import { birdRepository } from '../../../data/repositories'
import { BirdForm } from './BirdForm'
import { valuesToBirdInput, type BirdFormValues } from '../utils/birdFormValidation'
import { requestPersistentStorageWhenDataExists } from '../../pwa/pwaEnvironment'

export function BirdCreatePage() {
  const navigate = useNavigate()
  async function save(values: BirdFormValues, image: import('./BirdForm').ImageChange) {
    const input = valuesToBirdInput(values)
    const bird = image
      ? await birdRepository.createWithImage(input, image as MediaAsset)
      : await birdRepository.create(input)
    void requestPersistentStorageWhenDataExists(navigator.storage, true)
    navigate(`/schwarm/${encodeURIComponent(bird.id)}`, {
      replace: true,
      state: { notice: 'Vogelprofil wurde gespeichert.' },
    })
  }
  return <BirdForm onSubmit={save} />
}
