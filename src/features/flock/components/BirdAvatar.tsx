import { useEffect, useState } from 'react'
import { mediaRepository } from '../../../data/repositories'

export function BirdAvatar({
  imageId,
  name,
  className = '',
}: {
  imageId?: string
  name: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    setUrl(null)
    setFailed(false)
    if (imageId) {
      void mediaRepository
        .getById(imageId)
        .then((asset) => {
          if (!active) return
          if (!asset) {
            setFailed(true)
            return
          }
          objectUrl = URL.createObjectURL(asset.blob)
          setUrl(objectUrl)
        })
        .catch(() => {
          if (active) setFailed(true)
        })
    }
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageId])

  return (
    <span
      className={`bird-avatar ${className}`}
      aria-label={url ? `Profilbild von ${name}` : `Vogelsymbol für ${name}`}
    >
      {url ? (
        <img src={url} alt={`Profilbild von ${name}`} />
      ) : (
        <img src="/welli-icons/navigation/Schwarm.svg" alt="" aria-hidden="true" />
      )}
      {failed && <span className="visually-hidden">Profilbild konnte nicht geladen werden.</span>}
    </span>
  )
}
