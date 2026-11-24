# Welli@Home PWA

Welli@Home verwaltet Vogelprofile, Dokumentation, Erinnerungen, Körnermischungen und Favoriten lokal in IndexedDB. Persönliche Daten werden nicht an einen Betreiber-Server übertragen. Redaktionelle Inhalte kommen aus einer öffentlichen WordPress-REST-API und werden lokal zwischengespeichert.

## Architektur und lokale Daten

- `src/features/` enthält die fachlichen Bereiche; gemeinsame Komponenten und Datenzugriffe liegen in `src/shared/` und `src/data/`.
- Dexie speichert persönliche Daten im Browser. Das JSON-Backup wird lokal erstellt und muss vom Nutzer selbst sicher aufbewahrt werden.
- Der Service Worker und das Webmanifest liegen in `public/`; `build/precacheWorker.mjs` erstellt die versionsgebundene Offline-App-Shell.
- Die PWA benötigt eine eigene HTTPS-Origin. Redaktionelle Inhalte und neue externe Bilder setzen eine Verbindung zu `welliathome.de` voraus.

## Lokal starten

Node.js 24 und npm installieren. Befehle aus diesem Ordner ausführen. Die jeweilige WordPress-API-Basis kann über `.env.local` konfiguriert werden; der Wert wird öffentlich in den Build geschrieben.

```sh
npm ci
npm run dev
```

Vite gibt die lokale URL im Terminal aus. Wenn du eine andere WordPress-API verwenden möchtest, erstelle `.env.local` mit `VITE_WP_API_BASE_URL=https://deine-domain/wp-json/wp/v2`.

## Prüfen und bauen

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run verify-dist
npm run package
npm run preview
```

`npm run format` formatiert den Quellcode. Der Produktionsbuild liegt in `dist/`; `npm run build` führt TypeScript-Prüfung, Vite-Build und `verify-dist` aus. `npm run package` erzeugt nach dem Build ein uploadfähiges ZIP aus `dist/`. Für Offline-Tests die Vorschau per `npm run preview` öffnen und die Worker-Aktivierung abwarten.

Hinweise zu HTTPS, SPA-Fallback, Caching, Sicherheitsheadern und CSP stehen in der [Deployment-Dokumentation](docs/deployment.md). Hosting-Vorlagen für Apache, Nginx und Netlify liegen in [docs/deployment/](docs/deployment/).
