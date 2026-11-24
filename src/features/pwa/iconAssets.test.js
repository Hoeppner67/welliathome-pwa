import { readFileSync } from 'node:fs'
import { decode } from 'fast-png'
import { describe, expect, it } from 'vitest'

function readRgba(name) {
  const image = decode(readFileSync(`public/welli-icons/${name}`))
  expect(image.depth).toBe(8)
  const { width, height, data, channels, palette } = image
  const pixels = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    if (palette) {
      const color = palette[data[i]]
      pixels.set([color[0], color[1], color[2], color[3] ?? 255], i * 4)
    } else {
      expect(channels).toBe(4)
      pixels.set(data.subarray(i * 4, i * 4 + 4), i * 4)
    }
  }
  return { width, height, pixels }
}

describe('PWA-Icondateien', () => {
  it.each([
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ])('%s ist transparent und korrekt dimensioniert', (name, size) => {
    const { width, height, pixels } = readRgba(name)
    expect([width, height]).toEqual([size, size])
    expect(pixels[3]).toBe(0)
    expect(pixels.some((value, index) => index % 4 === 3 && value === 255)).toBe(true)
  })

  it('hat einen deckenden beigen Hintergrund außerhalb des Sicherheitskreises', () => {
    const { width, height, pixels } = readRgba('icon-maskable-512.png')
    expect([width, height]).toEqual([512, 512])
    let outsideErrors = 0,
      alphaErrors = 0,
      motifPixels = 0
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (pixels[i + 3] !== 255) alphaErrors++
        const motif = pixels[i] !== 229 || pixels[i + 1] !== 226 || pixels[i + 2] !== 211
        if (motif) motifPixels++
        if (motif && (x + 0.5 - 256) ** 2 + (y + 0.5 - 256) ** 2 > 204.8 ** 2) outsideErrors++
      }
    expect(alphaErrors).toBe(0)
    expect(outsideErrors).toBe(0)
    expect(motifPixels).toBeGreaterThan(1000)
  })
})
