import { Component, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section>
        <h1>Seite konnte nicht geladen werden</h1>
        <p role="alert">
          Versuche, die Seite neu zu laden. Über die Datensicherung kannst du deine lokalen Daten
          exportieren.
        </p>
        <Link to="/datensicherung">Zur Datensicherung</Link>
      </section>
    )
  }
}
