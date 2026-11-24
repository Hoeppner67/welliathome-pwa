import { Link } from 'react-router-dom'
import { Card } from '../../shared/components/Card'
export function NotFoundPage() {
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <Card>
        <p className="eyebrow">Seite nicht gefunden</p>
        <h1 id="not-found-title">Hier kann dein Welli nicht landen.</h1>
        <p>Die Adresse ist vielleicht veraltet oder wurde falsch eingegeben.</p>
        <Link className="button button--primary" to="/">
          Zur Startseite
        </Link>
      </Card>
    </section>
  )
}
