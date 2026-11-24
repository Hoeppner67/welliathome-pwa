import { Link, useLocation } from 'react-router-dom'
import { SafeLink } from './SafeLink'
export function Header() {
  const location = useLocation()
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <SafeLink
          className="brand__mark"
          href="https://welliathome.de/"
          aria-label="Welli@Home Webseite öffnen"
          title="welliathome.de öffnen"
        >
          <img className="brand__logo" src="/welliathome-logo.svg" alt="" />
        </SafeLink>
        <Link
          to="/"
          className="brand__home"
          aria-label="Welli@Home – Startseite"
          title="Startseite öffnen"
        >
          Welli<span className="brand__at">@</span>Home
        </Link>
        {location.pathname !== '/synchronisation' && location.pathname !== '/einstellungen' && (
          <Link
            to="/synchronisation"
            state={{ from: location }}
            className="header-settings"
            aria-label="Synchronisation"
            title="Synchronisation"
          >
            <img src="/welli-icons/Synchronisation.svg" alt="" />
          </Link>
        )}
      </div>
    </header>
  )
}
