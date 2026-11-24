import { describe, expect, it } from 'vitest'
import { classifyLink } from './linkPolicy'

describe('Linkziele', () => {
  const base = 'https://app.welliathome.de/app/artikel'
  it('unterscheidet Ursprung und Geltungsbereich', () => {
    expect(classifyLink('/app/schwarm', base, '/app/')).toEqual({
      href: '/app/schwarm',
      external: false,
    })
    expect(classifyLink('/anders', base, '/app/')?.external).toBe(true)
    expect(classifyLink('https://welliathome.de/', base, '/app/')?.external).toBe(true)
    expect(classifyLink('https://wellizuhause.de/', base, '/app/')?.external).toBe(true)
    expect(classifyLink('#abschnitt', base, '/app/')?.external).toBe(false)
    expect(classifyLink('weiter', base, '/app/')?.external).toBe(false)
  })
  it('erlaubt native Protokolle und blockiert unsichere URLs', () => {
    expect(classifyLink('mailto:test@example.org', base)?.external).toBe(false)
    expect(classifyLink('tel:+49123', base)?.external).toBe(false)
    expect(classifyLink('javascript:alert(1)', base)).toBeUndefined()
    expect(classifyLink('data:text/html,evil', base)).toBeUndefined()
  })
})
