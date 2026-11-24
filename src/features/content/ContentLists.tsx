import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../shared/components/Card'
import { plantIntroduction } from './htmlContent'
import {
  articleTitle,
  mainWikiCategoryIds,
  matchesPlant,
  matchesWiki,
  wikiSummary,
} from './contentSearch'
import { CONTENT_FAVORITE_PLANT, CONTENT_FAVORITE_WIKI, toggleFavorite } from './favoriteService'
import { FavoriteFilterChip, SyncStatus } from './ContentControls'
import { useContent } from './useContent'

export function WelliPediaPage() {
  const data = useContent('wellipedia')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])
  const [category, setCategory] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const mainCategories = useMemo(
    () => data.categories.filter((item) => item.parentId === 0),
    [data.categories],
  )
  const summaries = useMemo(
    () => new Map(data.articles.map((article) => [article.id, wikiSummary(article)])),
    [data.articles],
  )
  const rows = useMemo(
    () =>
      data.articles
        .filter(
          (item) =>
            matchesWiki(item, debouncedQuery) &&
            (!category ||
              mainWikiCategoryIds(item.categoryIds, data.categories).includes(category)) &&
            (!onlyFavorites || data.favorites.has(item.id)),
        )
        .sort(
          (a, b) =>
            articleTitle(a.title).localeCompare(articleTitle(b.title), 'de-DE', {
              sensitivity: 'base',
            }) || a.wpId - b.wpId,
        ),
    [data.articles, data.categories, data.favorites, debouncedQuery, category, onlyFavorites],
  )
  return (
    <section className="content-page">
      <header className="page-intro">
        <h1>WelliPedia</h1>
        <p className="page-intro__copy">Artikel aus der Welli@Home-Wissensdatenbank</p>
      </header>
      <SyncStatus
        syncAt={data.syncAt}
        skipped={data.skipped}
        syncing={data.syncing}
        error={data.error}
        onUpdate={() => void data.update()}
        count={data.articles.length}
        label="Artikel"
        syncingLabel="Artikel werden synchronisiert …"
      />
      <div className="content-controls">
        <label>
          Artikel durchsuchen
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder="Suchbegriff eingeben"
          />
        </label>
        <label>
          Thema
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Alle Themen</option>
            {mainCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </label>
        <FavoriteFilterChip
          active={onlyFavorites}
          onToggle={() => setOnlyFavorites((active) => !active)}
        />
      </div>
      {data.loading ? (
        <p role="status">Artikel werden geladen …</p>
      ) : data.syncing && data.articles.length === 0 ? (
        <p role="status">Artikel werden synchronisiert …</p>
      ) : rows.length ? (
        <div className="content-list">
          {rows.map((item) => (
            <Card key={item.id} className="content-card">
              <h2>
                <Link to={`/wellipedia/${item.id}`}>{articleTitle(item.title)}</Link>
              </h2>
              <p>{summaries.get(item.id)}</p>
              <div className="content-card__actions">
                <Link className="button button--primary" to={`/wellipedia/${item.id}`}>
                  Eintrag öffnen
                </Link>
                <button
                  className="content-favorite"
                  type="button"
                  aria-pressed={data.favorites.has(item.id)}
                  onClick={() =>
                    void toggleFavorite(
                      CONTENT_FAVORITE_WIKI,
                      item.id,
                      articleTitle(item.title),
                      data.favorites.has(item.id),
                    ).then(data.load)
                  }
                >
                  {data.favorites.has(item.id) ? '★ Favorit' : '☆ Merken'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : onlyFavorites ? (
        <p>Keine passenden Favoriten gefunden</p>
      ) : data.articles.length === 0 ? (
        <p>Noch keine Artikel vorhanden.</p>
      ) : (
        <p>Keine passenden Artikel gefunden.</p>
      )}
    </section>
  )
}
export function PlantsPage() {
  const data = useContent('plants')
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const introductions = useMemo(
    () =>
      new Map(
        data.plants.map((plant) => [
          plant.id,
          plant.introText || plantIntroduction(plant.contentHtml),
        ]),
      ),
    [data.plants],
  )
  const groups = useMemo(
    () =>
      [...new Set(data.plants.flatMap((plant) => plant.groupNames))].sort((a, b) =>
        a.localeCompare(b, 'de-DE'),
      ),
    [data.plants],
  )
  const rows = useMemo(
    () =>
      data.plants
        .filter(
          (item) =>
            matchesPlant(item, query) &&
            (!group || item.groupNames.includes(group)) &&
            (!onlyFavorites || data.favorites.has(item.id)),
        )
        .sort(
          (a, b) =>
            a.title.localeCompare(b.title, 'de-DE', { sensitivity: 'base' }) || a.wpId - b.wpId,
        ),
    [data.plants, data.favorites, query, group, onlyFavorites],
  )
  return (
    <section className="content-page">
      <header className="page-intro">
        <h1>Futterpflanzen</h1>
        <p className="page-intro__copy">Pflanzenporträts von Welli@Home</p>
      </header>
      <SyncStatus
        syncAt={data.syncAt}
        skipped={data.skipped}
        syncing={data.syncing}
        error={data.error}
        onUpdate={() => void data.update()}
        count={data.plants.length}
        label="Pflanzen"
        syncingLabel="Pflanzen werden synchronisiert …"
      />
      <div className="content-controls">
        <label>
          Pflanze suchen
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchbegriff eingeben"
          />
        </label>
        <label>
          Pflanzengruppe
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Alle Gruppen</option>
            {groups.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <FavoriteFilterChip
          active={onlyFavorites}
          onToggle={() => setOnlyFavorites((active) => !active)}
        />
      </div>
      {data.loading ? (
        <p role="status">Pflanzen werden geladen …</p>
      ) : rows.length ? (
        <div className="content-list">
          {rows.map((item) => {
            const introText = introductions.get(item.id)
            return (
              <Card key={item.id} className="content-card content-card--plant">
                <h2>
                  <Link to={`/futterpflanzen/${item.id}`}>{item.title}</Link>
                </h2>
                {item.scientificName && (
                  <p className="content-scientific">
                    <i>{item.scientificName}</i>
                  </p>
                )}
                {introText && <p>{introText}</p>}
                {item.warningNotes.map((warning, i) => (
                  <p className="content-warning" key={i}>
                    {warning}
                  </p>
                ))}
                <div className="content-card__actions">
                  <Link className="button button--primary" to={`/futterpflanzen/${item.id}`}>
                    Pflanzenporträt öffnen
                  </Link>
                  <button
                    className="content-favorite"
                    type="button"
                    aria-pressed={data.favorites.has(item.id)}
                    onClick={() =>
                      void toggleFavorite(
                        CONTENT_FAVORITE_PLANT,
                        item.id,
                        item.title,
                        data.favorites.has(item.id),
                      ).then(data.load)
                    }
                  >
                    {data.favorites.has(item.id) ? '★ Favorit' : '☆ Merken'}
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      ) : onlyFavorites ? (
        <p>Keine passenden Favoriten gefunden</p>
      ) : data.plants.length === 0 ? (
        <p>
          {data.error
            ? 'Pflanzenprofile konnten nicht geladen werden.'
            : 'Noch keine Pflanzenprofile vorhanden.'}
        </p>
      ) : (
        <p>Keine passenden Pflanzen gefunden.</p>
      )}
    </section>
  )
}
