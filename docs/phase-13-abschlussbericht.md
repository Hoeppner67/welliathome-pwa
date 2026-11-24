# Welli@Home · Phase 13

## 1. Ausgangsergebnis

Geprüft wurde der vom Nutzer bestätigte aktuelle Workspace `welliathome-pwa`. PowerShell blockierte den npm-Starter `npm.ps1`. Die vier vorgegebenen Befehle wurden vor der ersten Änderung in derselben Reihenfolge über `cmd` ausgeführt.

| Prüfung | Unveränderter Ausgangsstand | Abschluss |
| --- | --- | --- |
| `npm run typecheck` | Bestanden | Bestanden |
| `npm test` | 140 Tests in 26 Dateien bestanden | 146 Tests in 27 Dateien bestanden |
| `npm run lint` | Bestanden | Bestanden |
| `npm run build` | Bestanden | Bestanden |

## 2. Gefundene Fehler

- Der aktive Service Worker konnte bei einer Navigation bereits das HTML eines neuen Releases ausliefern, während der neue Worker noch wartete. Bei anschließender Netztrennung konnte dieses HTML auf Bundles verweisen, die im aktiven Cache fehlten.
- Der Offline-Status nannte den Verbindungsbedarf für Bestelllinks und WordPress-Abfragen nur allgemein.
- Der Update-Button berücksichtigte vorhandene Formulareingaben. Bei Eingaben zwischen dem Klick und dem späteren Controllerwechsel konnte der automatische Reload einen neuen Entwurf verwerfen.

## 3. Korrekturen

- Navigations-HTML, Bundles und Manifest stammen aus dem Cache des aktiven Builds. Der Netzwerkpfad bleibt für direkt aufgerufene Assets, REST-Pfade und andere Origins verfügbar.
- Der Reload prüft auch beim Controllerwechsel, ob sich noch ein bearbeitetes Formular auf der Seite befindet. Falls ja, bleibt der Entwurf offen und der Reload kann nach Speichern oder Verwerfen erneut ausgelöst werden.
- Der Offline-Hinweis nennt Bestelllinks und WordPress-Aktualisierungen ausdrücklich.
- Die IndexedDB-Schemata und die WordPress-Synchronisierungslogik blieben bestehen. Navigation, Farben, Winky Sans und PNG-Icons wurden beibehalten.

## 4. Geänderte Dateien

| Datei | Änderung |
| --- | --- |
| [public/sw.js](../public/sw.js) | Versionsgebundene App-Shell und Manifest-Cache |
| [PwaStatus.tsx](../src/features/pwa/PwaStatus.tsx) | Schutz bei Eingaben während der Update-Aktivierung |
| [pwaEnvironment.ts](../src/features/pwa/pwaEnvironment.ts) | Konkreter Offline-Hinweis |
| [appDatabase.test.ts](../src/data/database/appDatabase.test.ts) | Migrationstests |
| [contentSyncService.test.ts](../src/features/content/contentSyncService.test.ts) | Fehlerszenarien, Wiederaufnahme und Favoritenerhalt |
| [feedRecommendations.test.ts](../src/features/feed-mixes/services/feedRecommendations.test.ts) | Persistenz der bearbeiteten Claus-Notiz |
| [PwaStatus.test.tsx](../src/features/pwa/PwaStatus.test.tsx) | Entwurf blockiert das angebotene Update |
| [serviceWorker.test.ts](../src/features/pwa/serviceWorker.test.ts) | Konsistenz von HTML und Manifest, Netzwerkgrenzen |
| [deployment.md](deployment.md) | Abnahme für bestehendes Webhosting |
| [phase-13-abschlussbericht.md](phase-13-abschlussbericht.md) | Dieser Bericht |

## 5. Regressionstests

Sechs zusätzliche Testfälle decken Updates von Schema 1, 2 und 3 auf Schema 4, die bearbeitete Claus-Notiz nach Neustart, einen erneuten WordPress-Abruf nach Netzfehler und ungültigem JSON sowie die Netzwerkgrenzen des Workers ab. Zwei vorhandene Testfälle wurden für die versionsgebundene App-Shell und die Updatesperre bei einem bearbeiteten Formular angepasst.

Die bestehende Testsuite deckt das Erfassen und Bearbeiten von Gewicht, Medikamenten und Ereignissen, die einmalige Anlage der vier Empfehlungen und das Ausbleiben manuell gelöschter Empfehlungen ab. Sie prüft außerdem den Backup-Rundlauf mit persönlichen Tabellen, Relationen und Profilbild sowie das transaktionale Verhalten bei Fehlern.

## 6. Abschlussprüfung

Alle vier Befehle endeten erfolgreich. Die Vite-Ausgabe für das Webhosting liegt in `dist/`. Datenbankname und Schemaversion von IndexedDB entsprechen dem Ausgangsstand. Die lokale Vite-Vorschau lieferte für die verschachtelte Route HTTP 200 mit HTML und für `/sw.js` JavaScript mit `Cache-Control: no-cache`.

## 7. Browser- und Gerätestatus

Produktionsvorschau auf Loopback in Microsoft Edge mit Geräteemulation. Redaktionelle Daten kamen aus lokalen WordPress-Mock-Antworten. Nach Aktivierung des Service Workers wurden jeweils zehn Routen offline aufgerufen. Darunter waren Start, Schwarm, Profildetail, Erfassungsformular, Körnermischungen, beide redaktionellen Listen und Detailansichten sowie Datensicherung. Ein eigenes Rezept mit 35 Zutaten und die Empfehlungen wurden geladen.

| Ansicht | Größe in CSS-Pixeln | Tatsächlicher Prüfstatus |
| --- | --- | --- |
| Kleines Android-Smartphone | 320 × 640 | Zehn Offline-Routen ohne horizontalen Überlauf |
| Großes Android-Smartphone | 412 × 915 | Zehn Offline-Routen ohne horizontalen Überlauf |
| iPhone | 390 × 844 | Zehn Offline-Routen ohne horizontalen Überlauf in Edge-Emulation |
| iPad | 768 × 1024 | Zehn Offline-Routen ohne horizontalen Überlauf in Edge-Emulation |
| Desktop | 1440 × 900 | Zehn Offline-Routen ohne horizontalen Überlauf |
| Android-Gerät | – | Ausstehend. ADB meldete kein verbundenes Gerät. |
| iPhone und iPad mit Safari | – | Ausstehend. Kein physisches Gerät verfügbar. |

In Edge wurde ein Update zwischen zwei lokalen Produktionsbuilds erkannt. Ein geänderter Vogelname im Formular blockierte die Aktion. Nach Verwerfen des Entwurfs aktivierte der Klick den neuen Worker, der alte Shell-Cache wurde entfernt und das gespeicherte Vogelprofil blieb verfügbar. Der Browser konnte das Manifest lesen und alle sechs eingebundenen PNG-Icon-Größen dekodieren. Bei 320 CSS-Pixeln wurden außerdem Akkordeon, Dialogfokus, Escape, Texteingabe und Such-/Favoritenbedienung geprüft. In den abgeschlossenen Browserläufen wurden keine JavaScript- oder Konsolenfehler erfasst.

## 8. Offene Prüfungen

- Installation auf dem Android- und iOS-Home-Bildschirm, Start ohne Netz aus der installierten App und Symbolwechsel einer bestehenden Installation.
- Native Bildschirmtastatur, Safe Areas am Gerätegehäuse, Touch-Bedienung und Scrollverhalten auf echter Hardware. Die CSS-Regeln für Safe Areas wurden im Quellcode geprüft.
- Vollständige Barrierefreiheitsprüfung mit Screenreader und Kontrastmessung. Der Dialogfokus und das Schließen per Escape wurden im Browser geprüft.
- HTTPS, CSP, Header, SPA-Fallback und WordPress-CORS auf dem Zielhosting. Die lokale Vite-Vorschau antwortete auf eine fehlende Datei unter `/assets/` mit HTTP 200 und dem SPA-HTML. Die Hosting-Vorlagen sehen HTTP 404 für fehlende Assets vor. Dieser Status muss auf dem Zielhosting geprüft werden. WordPress wurde per Mock angesprochen.

## 9. Veröffentlichungsreife

Der Build ist für die Abnahme auf dem Zielhosting vorbereitet. Die Produktionsfreigabe bleibt bis zu den Geräte- und Zielhostingtests offen. Es wurden keine Dateien veröffentlicht und keine Änderungen am Live-System vorgenommen. Die Schritte für das bestehende Webhosting stehen in der [Deployment-Dokumentation](deployment.md).
