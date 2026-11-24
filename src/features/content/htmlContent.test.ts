// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  plainTextFromHtml,
  plantCardImage,
  plantIntroduction,
  preparePlantArticleHtml,
  prepareWikiArticleHtml,
  sanitizeWordPressHtml,
} from './htmlContent'

describe('WordPress HTML', () => {
  it('entfernt Skripte, Handler und javascript-Links', () => {
    const safe = sanitizeWordPressHtml(
      '<p onclick="run()">Text</p><script>alert(1)</script><a href="javascript:alert(1)">Link</a>',
    )
    expect(safe).not.toContain('script')
    expect(safe).not.toContain('onclick')
    expect(safe).not.toContain('javascript:')
    expect(safe).toContain('Text')
  })
  it('extrahiert lesbaren Suchtext', () =>
    expect(plainTextFromHtml('<h2>Gräser</h2><p>Frisches Futter</p>')).toContain('Frisches Futter'))
  it('ignoriert die Anfangszusammenfassung und frühe Bilder für den Einleitungstext', () => {
    const html =
      '<details><summary>Zusammenfassung</summary><p class="summary">Zusammenfassungstext</p></details><div><img src="https://welliathome.de/fruehes-bild.jpg"></div><p>Dies ist der Einleitungssatz des Pflanzenporträts.</p>'
    expect(plantIntroduction(html)).toBe('Dies ist der Einleitungssatz des Pflanzenporträts.')
  })
  it('wählt nur das Bild aus der Pflanzenkarte mit Futterteilen', () => {
    const html =
      '<div class="gb-element-intro"><img src="https://welliathome.de/fruehes-bild.jpg"></div><div class="gb-element-card"><img src="https://welliathome.de/pflanzenkarte-400.jpg" srcset="https://welliathome.de/pflanzenkarte-400.jpg 400w, https://welliathome.de/pflanzenkarte-original.jpg 1200w" alt="Pflanze"><h3>Futterteile</h3></div>'
    expect(plantCardImage(html)).toEqual({
      url: 'https://welliathome.de/pflanzenkarte-original.jpg',
      alt: 'Pflanze',
    })
  })
  it('erkennt das Kartenbild auch bei einem Futterteile-Textblock', () => {
    const html =
      '<p>Einleitung</p><div class="gb-element-card"><a href="/bild.jpg"><img src="https://welliathome.de/bild-400.jpg" srcset="https://welliathome.de/bild-400.jpg 400w, https://welliathome.de/bild.jpg 800w" alt="Acker-Fuchsschwanz"></a><div class="gb-element-info"><h2>Acker-Fuchsschwanz</h2><div class="gb-text gb-text-f3f89de3"><strong>Futterteile</strong></div><ul><li>Samen</li></ul></div></div>'
    expect(plantCardImage(html)).toEqual({
      url: 'https://welliathome.de/bild.jpg',
      alt: 'Acker-Fuchsschwanz',
    })
    const prepared = preparePlantArticleHtml(html)
    expect(prepared).not.toContain('<img')
    expect(prepared).toContain('Futterteile')
    expect(prepared).toContain('Samen')
  })
  it('entfernt Pflanzen-Zusammenfassung, Vorab-Bilder und Erntezeit samt folgendem Inhalt', () => {
    const prepared = preparePlantArticleHtml(
      '<details><summary>Zusammenfassung</summary><p class="summary">Kurzfassung</p></details><div><img src="https://welliathome.de/vorab.jpg"></div><p>Einleitung bleibt.</p><div class="gb-element-card"><img src="https://welliathome.de/karte.jpg"><h3>Futterteile</h3><p>Blätter</p></div><h3>Erntezeit</h3><p>Mai bis Juni</p><img src="https://welliathome.de/nachher.jpg"><p>Weitere Hinweise</p>',
    )
    expect(prepared).toContain('Einleitung bleibt.')
    expect(prepared).toContain('Futterteile')
    expect(prepared).toContain('Blätter')
    expect(prepared).not.toContain('Zusammenfassung')
    expect(prepared).not.toContain('Kurzfassung')
    expect(prepared).not.toContain('vorab.jpg')
    expect(prepared).not.toContain('karte.jpg')
    expect(prepared).not.toContain('Erntezeit')
    expect(prepared).not.toContain('Mai bis Juni')
    expect(prepared).not.toContain('nachher.jpg')
    expect(prepared).not.toContain('Weitere Hinweise')
  })
  it('entfernt Wiki-Zusammenfassung, Autorenzeile und Quellen-Nachspann', () => {
    const prepared = prepareWikiArticleHtml(
      '<details><summary>Zusammenfassung</summary><p class="summary">Kurztext</p></details><div><span>Thorsten Hoeppner | Welli@Home</span><p>Aktualisiert</p></div><h2>Eintrag</h2><p>Inhalt</p><div>Quellennachweise</div><ul><li>Quelle</li></ul>',
    )
    expect(prepared).not.toContain('Zusammenfassung')
    expect(prepared).not.toContain('Kurztext')
    expect(prepared).not.toContain('Thorsten Hoeppner')
    expect(prepared).toContain('Inhalt')
    expect(prepared).not.toContain('Quellennachweise')
    expect(prepared).not.toContain('Quelle')
  })
  it('entfernt den Aktualisierungshinweis und die interne Seitenlinkliste', () => {
    const prepared = prepareWikiArticleHtml(
      '<h2>Artikel</h2><p>Inhalt bleibt</p><div class="gb-element-date"><div>Aktualisiert am 10. November 2026</div></div><div aria-label="List"><li><span><svg></svg></span><a href="https://welliathome.de/wiki/anderer-artikel/">Weiterer Artikel</a></li></div><p>Nachspann</p><div>Quellennachweise</div>',
    )
    expect(prepared).toContain('Inhalt bleibt')
    expect(prepared).not.toContain('Aktualisiert am')
    expect(prepared).not.toContain('Weiterer Artikel')
  })
  it('entfernt das wiederholte Titelbild und stellt markierten Text ohne gelben Hintergrund dar', () => {
    const prepared = prepareWikiArticleHtml(
      '<p>Text <mark style="background-color:rgba(0,0,0,0)">farbig</mark></p><img src="https://welliathome.de/bild.jpg">',
      'https://welliathome.de/bild.jpg',
    )
    const safe = sanitizeWordPressHtml(prepared)
    expect(safe).not.toContain('<img')
    expect(safe).not.toContain('<mark')
    expect(safe).toContain('farbig')
  })
  it.each([
    '<svg><foreignObject><p><img src="https://welliathome.de/payload.png" onerror="alert(1)"></p></foreignObject></svg>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
  ])('entfernt Namespaces und aktive Attribute auch nach erneuter HTML-Interpretation', (html) => {
    const safe = sanitizeWordPressHtml(html)
    const body = new DOMParser().parseFromString(safe, 'text/html').body
    expect(body.querySelector('svg, math, style, [onerror]')).toBeNull()
  })
  it.each([
    '<a href="java&#x73;cript:alert(1)">Link</a>',
    '<a href="jav&#x0a;ascript:alert(1)">Link</a>',
    '<a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">Link</a>',
    '<img src="https://evil.example/a.png" onerror="alert(1)">',
    '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
    '<form action="https://evil.example"><input name="password"></form>',
  ])('entfernt aktive Inhalte und unzulässige Ziele nach erneutem Parsen: %s', (html) => {
    const body = new DOMParser().parseFromString(sanitizeWordPressHtml(html), 'text/html').body
    expect(body.querySelector('script, iframe, form, input, [onerror], [onclick]')).toBeNull()
    for (const link of body.querySelectorAll('a[href]')) {
      expect(link.getAttribute('href')).not.toMatch(/^(?:javascript|data):/i)
    }
    for (const image of body.querySelectorAll('img[src]')) {
      expect(new URL(image.getAttribute('src')!).origin).toBe('https://welliathome.de')
    }
  })
  it('erlaubt nur Bilder der exakten sicheren Herkunft und setzt Link-Attribute', () => {
    const safe = sanitizeWordPressHtml(
      '<img src="/ok.jpg"><img src="https://welliathome.de:444/out.jpg"><img src="https://other.example/out.jpg"><a href="/wiki">Wiki</a>',
    )
    const body = new DOMParser().parseFromString(safe, 'text/html').body
    expect([...body.querySelectorAll('img')].map((image) => image.getAttribute('src'))).toEqual([
      'https://welliathome.de/ok.jpg',
    ])
    expect(body.querySelector('a')?.getAttribute('href')).toBe('/wiki')
    expect(body.querySelector('a')?.hasAttribute('target')).toBe(false)
  })
  it('präfixt Artikel-IDs gegen App-Kollisionen und erhält passende Anker', () => {
    const safe = sanitizeWordPressHtml(
      '<h2 id="main-content">Info</h2><a href="#main-content">Anker</a><a href="#missing">Fehlender Anker</a>',
    )
    const body = new DOMParser().parseFromString(safe, 'text/html').body
    expect(body.querySelector('#wp-main-content')).toBeTruthy()
    expect(body.querySelector('a')?.getAttribute('href')).toBe('#wp-main-content')
    expect(body.querySelectorAll('a')[1].hasAttribute('href')).toBe(false)
  })

  it('behält native Links und öffnet externe Links sicher', () => {
    const safe = sanitizeWordPressHtml(
      '<h2 id="info">Info</h2><a href="#info">Anker</a><a href="https://wellizuhause.de/">Extern</a><a href="mailto:test@example.org">Mail</a><a href="javascript:alert(1)">Unsicher</a>',
    )
    const body = new DOMParser().parseFromString(safe, 'text/html').body
    const links = body.querySelectorAll('a')
    expect(body.querySelector('#wp-info')).toBeTruthy()
    expect(links[0].getAttribute('href')).toBe('#wp-info')
    expect(links[0].hasAttribute('target')).toBe(false)
    expect(links[1].getAttribute('target')).toBe('_blank')
    expect(links[1].getAttribute('rel')).toBe('noopener noreferrer')
    expect(links[2].getAttribute('href')).toBe('mailto:test@example.org')
    expect(links[3].hasAttribute('href')).toBe(false)
  })
})
