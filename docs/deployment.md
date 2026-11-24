# PWA veröffentlichen

## Status der Hosting-Prüfung

SSH-Host (`welliathome.lima-ssh.de`), Port (`22`), Benutzer (`welliathome`),
Produktivdomain (`https://app.welliathome.de`) und relatives Webverzeichnis
(`welli-app`) sind bekannt. SSH-Zugang, absoluter Webpfad, DocumentRoot, Host-Key-
Fingerprint sowie Unterstützung und Rechte für rsync/Symlinks sind **noch nicht
verifiziert**. Es liegt weder ein Deploy-Schlüssel noch ein vertrauenswürdiger
Host-Key-Fingerprint vor. Der separate Preflight ist deshalb vorbereitet, aber wurde
nicht ausgeführt. Er verändert keine Dateien und vergleicht den Hash von
`welli-app/index.html` mit der über HTTPS ausgelieferten Startseite, um den
DocumentRoot-Kandidaten zu bestätigen. `DEPLOY_CAPABILITIES_VERIFIED` darf erst nach
dieser Prüfung und zusätzlicher Bestätigung der nicht schreibfrei testbaren
Symlink-/Aktivierungsrechte auf `true` gesetzt werden.

## Voraussetzungen für GitHub Actions

Dieses Repository enthält derzeit keine GitHub-Actions-Workflowdateien. Der folgende
Ablauf beschreibt die Schutzmaßnahmen für eine spätere CI- und Deployment-
Automatisierung; die genannten Workflows sind hier noch nicht implementiert.

Ein künftiger CI-Workflow sollte TypeScript, Lint, Tests und Produktions-Build prüfen.
Ein separater Workflow `Deploy production` sollte nur manuell ausführbar sein und
sowohl eine ausdrückliche Workflow-Freigabe als auch die Freigabe des geschützten GitHub
Environments `production` verlangen. Für dieses Environment sind vor der ersten Nutzung
erforderliche Reviewer einzurichten; Administrator-Bypass sollte deaktiviert sein.
Pushes und Pull Requests veröffentlichen niemals.

Lege den privaten SSH-Schlüssel als GitHub-Environment-Secret
`DEPLOY_SSH_PRIVATE_KEY` ab. Den SHA256-Fingerprint des Server-Hostschlüssels musst du
aus einer vertrauenswürdigen Anbieterquelle beziehen und als Environment-Variable
`DEPLOY_SSH_HOSTKEY_SHA256` hinterlegen. Niemals private Schlüssel in Dateien, Commits
oder Chats einfügen. Der Public Key muss vor dem Preflight beim Hosting-Anbieter für
den SSH-Benutzer freigeschaltet werden.

Nach dem Preflight sind im GitHub-Environment `production` die folgenden Variablen
auf Basis des tatsächlichen Serverergebnisses einzurichten:

| Name                           | Inhalt                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `DEPLOY_ROOT`                  | absoluter, dedizierter und beschreibbarer Release-Pfad außerhalb des Webroots |
| `DEPLOY_DOCUMENT_ROOT`         | vom HTTPS-Abgleich bestätigter absoluter Pfad von `welli-app`                 |
| `DEPLOY_MODE`                  | `symlink` oder `directory-swap`, nach bestätigter Hosting-Konfiguration       |
| `DEPLOY_CAPABILITIES_VERIFIED` | erst nach dokumentierter Prüfung aller benötigten Fähigkeiten `true`          |

Der SSH-Host, Port, Benutzer und relative Webpfad sind in den Workflows auf die oben
genannten Werte festgelegt. `DEPLOY_ROOT` wird nicht aus einem vermuteten Home-Pfad
abgeleitet; wähle ihn erst nach der SSH-Prüfung und verifiziere, dass der Benutzer
dort Releases außerhalb des Webroots ablegen kann.

Der Fingerprint wird gegen den per `ssh-keyscan` gelesenen Schlüssel geprüft und SSH
verwendet anschließend `StrictHostKeyChecking=yes`. Verwende keinen ungeprüften
`ssh-keyscan`-Fingerprint. Nutze einen dedizierten Schlüssel mit minimalen Rechten.

## Vorabprüfung und Veröffentlichungsablauf

Der separate, manuell auszuführende Workflow `Deployment preflight` verlangt die
Eingabe `PREFLIGHT only`, das `production`-Environment und die dafür eingerichteten
SSH-Secrets. Er prüft Host-Key und Authentifizierung, löst `~/welli-app` zu einem
absoluten Pfad auf, vergleicht lesend dessen `index.html` mit der HTTPS-Startseite und
meldet rsync, Symlink-Werkzeuge, Schreibrechte und den freien Speicher am
Webverzeichnis. Der finale Speichercheck für Releases erfolgt später am konfigurierten
`DEPLOY_ROOT`. Der Preflight erstellt oder löscht auf dem Server keine Dateien. Der
Werkzeug-/Rechtecheck beweist nicht, dass die Hosting-Konfiguration Symlinks tatsächlich bis zum DocumentRoot verfolgt; dafür muss
der Anbieter bzw. Betreiber die Konfiguration zusätzlich bestätigen. Lege erst danach
die oben genannten Environment-Variablen an und setze
`DEPLOY_CAPABILITIES_VERIFIED=true`. Ohne sie bricht jeder mutierende Workflow ab.

Nach erfolgreicher CI-Prüfung und Freigabe:

1. Actions baut und prüft `dist/` erneut.
2. Der Deployment-Job verifiziert den SSH-Host-Key und führt den Capability-Check aus.
3. Der Build wird in ein neues, eindeutiges Verzeichnis unter
   `DEPLOY_ROOT/releases/` übertragen. rsync wird ohne `--delete` und ohne andere
   destruktive Optionen verwendet. Wenn rsync auf dem Server nicht vorhanden ist,
   nutzt der Workflow einen tar-Stream über SSH; fehlt auch tar, bricht er ab.
4. Vorhandene Releases werden nicht automatisch gelöscht. So bleiben mindestens die
   letzten fünf Versionen erhalten; bei Platzmangel wird abgebrochen, statt alte
   Releases automatisch zu entfernen.
5. Es werden nur die für die Aktivierung ausdrücklich eingerichteten Modi verwendet:

   - **`symlink` (bevorzugt):** Der Webserver-DocumentRoot muss auf
     `DEPLOY_ROOT/current` zeigen. Ein neuer Symlink wird neben dem aktiven Link
     erstellt und mit `mv -T` atomar eingesetzt. Das erfordert funktionierende
     Symlinks, GNU `mv` mit `-T`, gleiche Dateisystembedingungen und passende Rechte.
     Vor dem ersten automatisierten Rollout muss die bisher ausgelieferte Version als
     vollständiges Release unter `DEPLOY_ROOT/releases/` liegen und `current` bereits
     darauf zeigen. Der Preflight verweigert den Symlink-Modus ohne diese Rollback-Basis.
   - **`directory-swap` (Fallback):** Falls Symlinks nicht unterstützt oder nicht
     nutzbar sind, kopiert der Workflow in ein temporäres Verzeichnis neben dem
     DocumentRoot und ersetzt das DocumentRoot per Verzeichnis-Renames. Das erhält
     ab dem ersten Rollout die vorherige Version als `legacy-<Release-ID>` unter
     `DEPLOY_ROOT/releases/`; spätere Vorversionen bleiben zusätzlich unter
     `DEPLOY_ROOT/rollbacks/`. Zwischen den Renames kann eine kurze Unterbrechung
     auftreten. Es wird abgebrochen, wenn der DocumentRoot nicht sicher verschoben
     werden kann, ein Symlink ist oder die Pfade nicht auf demselben Dateisystem liegen.
     Es gibt keinen unsicheren In-place-Upload-Fallback.

   Der passende Modus darf erst nach Prüfung der konkreten Hosting-Konfiguration
   gewählt werden. Kann weder der Symlink-Modus noch der Verzeichniswechsel sicher
   ausgeführt werden, erfolgt keine Veröffentlichung; DocumentRoot-/Rechteänderungen
   müssen dann zuerst mit dem Anbieter geklärt werden.

6. Nach dem Wechsel prüft der Workflow HTTPS, Manifest, Service Worker, referenzierte
   Build-Assets sowie `/`, `/schwarm/neu`, `/einstellungen`, `/koernermischungen` und
   `/wellipedia`. Ein Fehler wird sichtbar gemeldet; anschließend kann der separate
   Rollback-Workflow ausgeführt werden.

## Rollback

`Rollback production` ist ein eigener, manuell auszuführender Workflow im geschützten
Environment `production`. Er erwartet die ID eines vorhandenen Releases und eine
ausdrückliche Freigabe, prüft zuerst dessen Vorhandensein und aktiviert es mit dem
konfigurierten Veröffentlichungsmodus. Auch nach dem Rollback werden HTTPS, Manifest,
Worker, Assets und zentrale Routen geprüft. Releases werden dabei nicht gelöscht.
Ein Release ist kompatibel, wenn es aus diesem Repository mit demselben App-Pfad und
derselben HTTPS-Origin stammt; ein Rollback ändert weder Origin noch Pfad.

## Lokale Daten, Origin und Hosting

Deployment und Rollback veröffentlichen ausschließlich statische Dateien. Die
IndexedDB im Browser (Dexie-Datenbank `WelliAtHomePwa`, einschließlich der lokalen
Medien in `mediaAssets`) wird weder angesprochen noch gelöscht oder verändert. Es werden
keine Dexie-Migrationen vorgenommen. Behalte `https://app.welliathome.de/` und den
App-Pfad `/` bei: IndexedDB ist an die Origin gebunden, und eine geänderte Origin wäre
für bestehende lokale Daten eine andere Datenbank.

Die Update-Benachrichtigung ist bereits implementiert: Ein wartender Service Worker
meldet eine neue Version; die Nutzerin oder der Nutzer aktiviert sie ausdrücklich.
Ungespeicherte Formulare verhindern die Aktivierung. Deployment erzwingt weder
`skipWaiting` im Browser noch einen Datenbank-Reset. Änderungen am Service Worker
dürfen nicht mit einer Löschroutine oder destruktiven Datenbankmigration vermischt
werden.

Unbekannte App-Routen müssen intern auf `/index.html` zeigen, ohne die URL zu ändern;
fehlende gehashte Dateien unter `/assets/` müssen HTTP 404 liefern. Setze
`Cache-Control: no-cache` für `/sw.js` und `/index.html` einschließlich SPA-Fallbacks
sowie `public, max-age=31536000, immutable` für gehashte Dateien unter `/assets/`.
Prüfe, dass die Plattform diese Header auf allen relevanten Routen und Fehlerantworten
ausliefert.

## Beispiel für Content Security Policy

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://welliathome.de blob:; font-src 'self'; connect-src 'self' https://welliathome.de; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
```

Bei einem abweichenden `VITE_WP_API_BASE_URL` muss dessen Origin in `connect-src`
stehen. Der API-Server muss Leseanfragen von der App-Origin per CORS erlauben. Teste
die CSP zuerst als Report-Only und prüfe dabei Profilbilder, redaktionelle Bilder und
das Teilen bzw. Herunterladen von Backups.

Ergänze zusätzlich für alle Antworten `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` und eine restriktive
`Permissions-Policy`, zum Beispiel `camera=(), microphone=(), geolocation=()`. Die
mitgelieferten Apache-, Nginx- und Netlify-Vorlagen enthalten diese Header. Prüfe, ob
die Zielplattform die Direktiven an allen Routen und Fehlerantworten tatsächlich
ausliefert.

Die Dateien in [deployment/](deployment/) sind Vorlagen für das Hosting.
