import { Suspense, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from '../../shared/components/Header'
import { MainNavigation } from '../../shared/components/MainNavigation'
import { PageContainer } from '../../shared/components/PageContainer'
import { PwaStatus } from '../../features/pwa/PwaStatus'
import { RouteErrorBoundary } from './RouteErrorBoundary'

const sectionTitles: Record<string, string> = {
  schwarm: 'Schwarm',
  koernermischungen: 'Körnermischungen',
  datensicherung: 'Datensicherung',
  synchronisation: 'Synchronisation',
  futterpflanzen: 'Futterpflanzen',
  wellipedia: 'WelliPedia',
}

export function AppShell() {
  const { pathname, key } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return
    let focused = false
    const section = sectionTitles[pathname.split('/')[1]]
    const update = () => {
      const heading = main.querySelector('h1')
      const title = heading?.textContent?.trim() || section
      document.title = title ? `${title} | Welli@Home` : 'Welli@Home'
      if (heading && !focused) {
        heading.tabIndex = -1
        if (document.activeElement === main || document.activeElement === document.body)
          heading.focus({ preventScroll: true })
        focused = true
      }
    }
    main.focus({ preventScroll: true })
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    update()
    const observer = new MutationObserver(update)
    observer.observe(main, { subtree: true, childList: true, characterData: true })
    return () => observer.disconnect()
  }, [pathname])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={() => mainRef.current?.focus()}>
        Zum Inhalt springen
      </a>
      <Header />
      <MainNavigation />
      <PwaStatus />
      <PageContainer>
        <main ref={mainRef} id="main-content" tabIndex={-1}>
          <RouteErrorBoundary key={key}>
            <Suspense fallback={<p role="status">Seite wird geladen …</p>}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </PageContainer>
    </div>
  )
}
