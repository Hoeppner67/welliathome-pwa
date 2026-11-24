// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import manifestText from '../../../public/manifest.webmanifest?raw'
import htmlText from '../../../index.html?raw'

describe('PWA-Manifest', () => {
  const html = new DOMParser().parseFromString(htmlText, 'text/html')
  const manifest = JSON.parse(manifestText) as {
    name: string
    short_name: string
    start_url: string
    scope: string
    display: string
    theme_color: string
    background_color: string
    lang: string
    categories: string[]
    shortcuts: Array<{ name: string; url: string }>
    icons: Array<{ sizes: string; purpose: string; src: string }>
  }

  it('enthält Namen, Sprache, Farben, Start-URL und Scope', () => {
    expect(manifest).toMatchObject({
      name: 'Welli@Home',
      short_name: 'Welli@Home',
      lang: 'de-DE',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#F2F2F2',
      background_color: '#E5E2D3',
    })
  })

  it('verwendet genau eine passende Theme-Farbe in HTML und Manifest', () => {
    const colors = html.head.querySelectorAll('meta[name="theme-color"]')
    expect(colors).toHaveLength(1)
    expect(colors[0].getAttribute('content')).toBe(manifest.theme_color)
  })

  it('verwendet transparente und maskierbare PNG-Icons', () => {
    expect(manifest.icons).toEqual([
      { src: '/welli-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/welli-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/welli-icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ])
  })

  it('bietet passende App-Kategorien und Direktzugriffe', () => {
    expect(manifest.categories).toEqual(['lifestyle', 'health'])
    expect(manifest.shortcuts).toEqual([
      {
        name: 'Erinnerungen',
        short_name: 'Erinnerungen',
        url: '/schwarm/erinnerungen',
        icons: [{ src: '/welli-icons/kalender.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      {
        name: 'Vogel hinzufügen',
        short_name: 'Vogel hinzufügen',
        url: '/schwarm/neu',
        icons: [{ src: '/welli-icons/add.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    ])
  })

  it('enthält eindeutige Apple-Metadaten mit dem erwarteten Inhalt', () => {
    const metadata = [...html.head.querySelectorAll('meta[name^="apple-mobile-web-app-"]')]
    expect(metadata.map((tag) => [tag.getAttribute('name'), tag.getAttribute('content')])).toEqual([
      ['apple-mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-title', 'Welli@Home'],
      ['apple-mobile-web-app-status-bar-style', 'default'],
    ])
  })

  it('bietet genau ein Apple-Touch-Icon je Größe an und behält das SVG-Favicon', () => {
    const links = [...html.head.querySelectorAll('link[rel="apple-touch-icon"]')]
    expect(links.map((link) => [link.getAttribute('sizes'), link.getAttribute('href')])).toEqual([
      ['120x120', '/welli-icons/icon-120.png'],
      ['152x152', '/welli-icons/icon-152.png'],
      ['167x167', '/welli-icons/icon-167.png'],
      ['180x180', '/apple-touch-icon.png'],
    ])
    expect(html.head.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.svg')
  })
})
