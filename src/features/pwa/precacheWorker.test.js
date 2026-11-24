import { describe, expect, it } from 'vitest'
import { shouldPrecache } from '../../../build/precacheWorker.mjs'

describe('Service-Worker-Precache-Auswahl', () => {
  it('lässt optionale PDF-Chunks und ungenutzte Icons aus', () => {
    for (const path of [
      'assets/html2canvas.esm-abc.js',
      'assets/index.es-abc.js',
      'assets/birdPdf-abc.js',
      'welli-icons/AppIcon-1024.png',
      'welli-icons/app/icon-512.svg',
      '.htaccess',
    ]) {
      expect(shouldPrecache(path)).toBe(false)
    }
  })

  it('behält App-Chunks, die DOM-Sanitizer und die nötigen Offline-Ressourcen', () => {
    for (const path of [
      'assets/index-main.js',
      'assets/purify.es-abc.js',
      'welli-icons/icon-192.png',
      'welliathome-logo.svg',
      'fonts/winky-sans-latin-wght-normal.woff2',
      'offline.html',
      'offline.css',
    ]) {
      expect(shouldPrecache(path)).toBe(true)
    }
  })
})
