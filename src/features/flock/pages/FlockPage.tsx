import { Link } from 'react-router-dom'
import { useBirds } from '../hooks/useBirds'
import { BirdCard } from '../components/BirdCard'
import { Card } from '../../../shared/components/Card'
import { Icon } from '../../../shared/components/Icon'
import '../../../styles/flock.css'

export function FlockPage() {
  const { birds, loading, error } = useBirds()
  return (
    <section className="flock-page" aria-labelledby="flock-title">
      <header className="page-intro">
        <h1 id="flock-title">Mein Schwarm</h1>
        <p className="page-intro__copy">Profile und Dokumentation</p>
      </header>
      <div className="add-action flock-page__actions">
        <Link
          className="button add-button"
          to="/schwarm/erinnerungen"
          aria-label="Erinnerungen"
          title="Erinnerungen"
        >
          <img src="/welli-icons/erinnerung.svg" alt="" aria-hidden="true" />
        </Link>
        <Link className="button add-button" to="/schwarm/neu" aria-label="Vogel hinzufügen">
          <img src="/welli-icons/add.svg" alt="" />
        </Link>
      </div>
      {loading && <p role="status">Schwarm wird geladen …</p>}
      {error && (
        <p className="flock-message flock-message--error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && birds.length === 0 && (
        <Card className="flock-empty">
          <span className="flock-empty__icon">
            <Icon name="bird" />
          </span>
          <h2>Noch keine Wellensittiche erfasst.</h2>
          <p>Erstelle dein erstes Vogelprofil, um deinen Schwarm zu verwalten.</p>
          <Link className="button button--primary" to="/schwarm/neu">
            Ersten Vogel erfassen
          </Link>
        </Card>
      )}
      {!loading && !error && birds.length > 0 && (
        <div className="bird-grid">
          {birds.map((bird) => (
            <BirdCard key={bird.id} bird={bird} />
          ))}
        </div>
      )}
    </section>
  )
}
