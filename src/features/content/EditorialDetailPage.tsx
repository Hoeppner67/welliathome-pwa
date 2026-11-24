import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ContentSyncSource, PlantArticle, WikiArticle } from '../../models'
import { editorialRepository } from '../../data/repositories/editorialRepository'
import { useDialogFocus } from '../../shared/components/useDialogFocus'
import { SafeLink } from '../../shared/components/SafeLink'
import {
  plantCardImage,
  plantCardThumbnailUrl,
  plantIntroduction,
  preparePlantArticleHtml,
  prepareWikiArticleHtml,
  removePlantIntroductionParagraph,
  sanitizeWordPressHtml,
} from './htmlContent'
import { articleTitle, mainWikiCategoryIds } from './contentSearch'
import {
  CONTENT_FAVORITE_PLANT,
  CONTENT_FAVORITE_WIKI,
  favoriteIds,
  toggleFavorite,
} from './favoriteService'
import { dateLabel } from './contentDate'

export function EditorialDetailPage({ source }: { source: ContentSyncSource }) {
  const { contentId = '' } = useParams()
  return (
    <EditorialDetail
      key={JSON.stringify([source, contentId])}
      source={source}
      contentId={contentId}
    />
  )
}

function EditorialDetail({ source, contentId }: { source: ContentSyncSource; contentId: string }) {
  const [article, setArticle] = useState<WikiArticle | PlantArticle>()
  const [error, setError] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [favoriteError, setFavoriteError] = useState('')
  const [plantImageOpen, setPlantImageOpen] = useState(false)
  const plantImageDialog = useRef<HTMLDivElement>(null)
  const plantImageCloseButton = useRef<HTMLButtonElement>(null)
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const wiki = source === 'wellipedia'
  useEffect(() => {
    let live = true
    void Promise.all([
      wiki
        ? editorialRepository.getWikiArticle(contentId)
        : editorialRepository.getPlant(contentId),
      favoriteIds(wiki ? CONTENT_FAVORITE_WIKI : CONTENT_FAVORITE_PLANT),
      wiki ? editorialRepository.listWikiCategories() : Promise.resolve([]),
    ])
      .then(([record, ids, categories]) => {
        if (!live) return
        setArticle(record)
        setFavorite(ids.has(contentId))
        setCategoryNames(
          'categoryIds' in (record ?? {})
            ? mainWikiCategoryIds((record as WikiArticle).categoryIds, categories)
                .map((id) => categories.find((cat) => cat.id === id)?.name)
                .filter((name): name is string => Boolean(name))
            : [],
        )
        if (!record)
          setError(
            'Dieser Inhalt ist nicht lokal verfügbar. Verbinde dich mit dem Internet und aktualisiere den Bereich.',
          )
      })
      .catch((cause) => {
        if (live)
          setError(
            cause instanceof Error ? cause.message : 'Der Inhalt konnte nicht geladen werden.',
          )
      })
    return () => {
      live = false
    }
  }, [contentId, wiki])
  useDialogFocus(plantImageDialog, plantImageCloseButton, plantImageOpen, () =>
    setPlantImageOpen(false),
  )
  const { displayContent, plantImage, plantImageFallback, plantIntro } = useMemo(() => {
    if (!article)
      return {
        displayContent: '',
        plantImage: undefined,
        plantImageFallback: undefined,
        plantIntro: undefined,
      }
    const content = article.contentHtml
    const featuredImageUrl =
      wiki && 'featuredImageUrl' in article ? article.featuredImageUrl : undefined
    const plantCardSource =
      !wiki && 'imageUrl' in article && article.imageUrl
        ? { url: article.imageUrl, alt: article.imageAlt ?? '' }
        : undefined
    const plantImage = !wiki ? (plantCardImage(content) ?? plantCardSource) : undefined
    const plantIntro = !wiki
      ? ('introText' in article && article.introText) || plantIntroduction(content)
      : undefined
    const displayContent = sanitizeWordPressHtml(
      wiki
        ? prepareWikiArticleHtml(content, featuredImageUrl)
        : removePlantIntroductionParagraph(preparePlantArticleHtml(content)),
    )
    return {
      displayContent,
      plantImage,
      plantImageFallback: !wiki ? plantCardThumbnailUrl(content) : undefined,
      plantIntro,
    }
  }, [article, wiki])
  if (error)
    return (
      <section className="content-page">
        <p role="alert">{error}</p>
        <Link className="back-link" to={wiki ? '/wellipedia' : '/futterpflanzen'}>
          Zurück zur Liste
        </Link>
      </section>
    )
  if (!article) return <p role="status">Inhalt wird geladen …</p>
  const currentArticle = article
  const title = wiki ? articleTitle(currentArticle.title) : currentArticle.title
  const permalink = currentArticle.permalink
  async function changeFavorite() {
    if (favoriteBusy) return
    setFavoriteBusy(true)
    setFavoriteError('')
    try {
      await toggleFavorite(
        wiki ? CONTENT_FAVORITE_WIKI : CONTENT_FAVORITE_PLANT,
        currentArticle.id,
        title,
        favorite,
      )
      setFavorite(!favorite)
    } catch {
      setFavoriteError('Der Favorit konnte nicht gespeichert werden. Bitte versuche es erneut.')
    } finally {
      setFavoriteBusy(false)
    }
  }
  return (
    <article className="content-page content-detail">
      {'featuredImageUrl' in currentArticle && currentArticle.featuredImageUrl && (
        <figure className="content-detail__hero-wrap">
          <img
            className="content-detail__hero"
            src={currentArticle.featuredImageUrl}
            alt={currentArticle.featuredImageAlt ?? ''}
          />
          {'featuredImageCaption' in currentArticle && currentArticle.featuredImageCaption && (
            <figcaption>{currentArticle.featuredImageCaption}</figcaption>
          )}
        </figure>
      )}
      <p className="eyebrow">{wiki ? 'WelliPedia' : 'Futterpflanze'}</p>
      <h1>{title}</h1>
      {plantIntro && <p className="plant-intro">{plantIntro}</p>}
      <p className="content-meta">Aktualisiert: {dateLabel(currentArticle.updatedAt)}</p>
      <button
        className="content-favorite"
        type="button"
        aria-pressed={favorite}
        disabled={favoriteBusy}
        onClick={() => void changeFavorite()}
      >
        {favorite ? '★ Favorit' : '☆ Als Favorit merken'}
      </button>
      {favoriteError && <p role="alert">{favoriteError}</p>}
      {wiki && categoryNames.length > 0 && <p>Themen: {categoryNames.join(', ')}</p>}
      {wiki ? (
        <div
          className="wordpress-content wordpress-content--boxed"
          dangerouslySetInnerHTML={{ __html: displayContent }}
        />
      ) : (
        <div className="plant-entry-box wordpress-content--boxed">
          {plantImage && (
            <figure className="content-detail__hero-wrap content-detail__hero-wrap--plant">
              <button
                className="content-detail__image-button"
                type="button"
                onClick={() => setPlantImageOpen(true)}
                aria-label={`Bild von ${title} in Originalgröße anzeigen`}
              >
                <img
                  className="content-detail__hero content-detail__hero--plant"
                  src={plantImage.url}
                  alt={plantImage.alt || title}
                  onError={(event) => {
                    if (plantImageFallback && event.currentTarget.src !== plantImageFallback)
                      event.currentTarget.src = plantImageFallback
                  }}
                />
              </button>
            </figure>
          )}
          <div className="wordpress-content" dangerouslySetInnerHTML={{ __html: displayContent }} />
        </div>
      )}
      {plantImageOpen && plantImage && (
        <div
          className="content-lightbox"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPlantImageOpen(false)
            }
          }}
        >
          <div
            ref={plantImageDialog}
            tabIndex={-1}
            className="content-lightbox__dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Pflanzenbild von ${title}`}
          >
            <button
              ref={plantImageCloseButton}
              className="content-lightbox__close"
              type="button"
              onClick={() => {
                setPlantImageOpen(false)
              }}
            >
              Schließen
            </button>
            <img
              src={plantImage.url}
              alt={plantImage.alt || title}
              onError={(event) => {
                if (plantImageFallback && event.currentTarget.src !== plantImageFallback)
                  event.currentTarget.src = plantImageFallback
              }}
            />
          </div>
        </div>
      )}
      <p className="content-source">
        Quelle: <SafeLink href={permalink}>Original-Webseite öffnen</SafeLink>
      </p>
    </article>
  )
}
