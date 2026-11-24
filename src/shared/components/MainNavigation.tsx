import { NavLink } from 'react-router-dom'
import { sections } from '../types/sections'
export function MainNavigation() {
  return (
    <nav className="main-navigation" aria-label="Hauptnavigation">
      <div className="main-navigation__inner">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link nav-link--home ${isActive ? 'is-active' : ''}`}
        >
          <img
            src="/welli-icons/navigation/startseite-kaefig.svg"
            alt=""
            aria-hidden="true"
            className="nav-link__icon"
          />
          <span>Start</span>
        </NavLink>
        {sections.map((section) => (
          <NavLink
            key={section.id}
            to={section.path}
            className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
          >
            <img src={section.iconSrc} alt="" aria-hidden="true" className="nav-link__icon" />
            <span>{section.title}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
