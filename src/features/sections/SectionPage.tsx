import { Link } from 'react-router-dom'
import { Card } from '../../shared/components/Card'
import { sections, type SectionId } from '../../shared/types/sections'
export function SectionPage({ section: sectionId }: { section: SectionId }) {
  const section = sections.find((item) => item.id === sectionId)!
  return (
    <section className="placeholder-page" aria-labelledby="section-title">
      <Link className="back-link" to="/">
        ← Alle Bereiche
      </Link>
      <Card className="placeholder-card">
        <span className="section-card__icon">
          <img src={section.iconSrc} alt="" aria-hidden="true" />
        </span>
        <p className="eyebrow">Welli@Home</p>
        <h1 id="section-title">{section.title}</h1>
        <p className="placeholder-page__subtitle">{section.subtitle}</p>
        <p>{section.description}</p>
        <p className="placeholder-note">
          Dieser Bereich wird in einem späteren Entwicklungsschritt ergänzt.
        </p>
      </Card>
    </section>
  )
}
