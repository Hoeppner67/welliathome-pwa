import type { ReactNode } from 'react'
import { Card } from '../../shared/components/Card'
import { SafeLink } from '../../shared/components/SafeLink'
import '../../styles/legal.css'

const PRIVACY_LAST_UPDATED = '21. November 2026'

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const titleId = title.toLowerCase().replaceAll(' ', '-')

  return (
    <section className="legal-page" aria-labelledby={titleId}>
      <header className="page-intro">
        <p className="eyebrow">Welli@Home</p>
        <h1 id={titleId}>{title}</h1>
      </header>
      <Card className="legal-document">{children}</Card>
    </section>
  )
}

export function ImprintPage() {
  return (
    <LegalPage title="Impressum">
      <h2>Anbieter und Kontakt</h2>
      <dl>
        <div>
          <dt>Name</dt>
          <dd>Thorsten Hoeppner</dd>
        </div>
        <div>
          <dt>Gesetzlicher Vertreter</dt>
          <dd>Thorsten Hoeppner</dd>
        </div>
        <div>
          <dt>Anschrift</dt>
          <dd>
            Neue Zeile 6
            <br />
            87600 Kaufbeuren
            <br />
            Deutschland
          </dd>
        </div>
        <div>
          <dt>E-Mail</dt>
          <dd>
            <a href="mailto:mail@welliathome.de">mail@welliathome.de</a>
          </dd>
        </div>
        <div>
          <dt>Telefon</dt>
          <dd>
            <a href="tel:+4983419969685">08341-9969685</a>
          </dd>
        </div>
      </dl>
    </LegalPage>
  )
}

export function PrivacyPage() {
  return (
    <LegalPage title="Datenschutz">
      <p>
        <strong>Stand: {PRIVACY_LAST_UPDATED}</strong>
      </p>

      <h2>Verantwortliche Stelle</h2>
      <p>
        Verantwortlich für die Verarbeitung personenbezogener Daten im Zusammenhang mit diesem
        Angebot ist:
      </p>
      <p>
        Thorsten Hoeppner
        <br />
        Neue Zeile 6
        <br />
        87600 Kaufbeuren, Deutschland
        <br />
        E-Mail: <a href="mailto:mail@welliathome.de">mail@welliathome.de</a>
      </p>

      <h2>Persönliche Daten in der App</h2>
      <p>
        Vogelprofile, Profilbilder, Medikamente, Gewichts- und Chronikeinträge, Erinnerungen,
        Körnermischungen und Favoriten werden auf deinem Gerät im lokalen Browserspeicher
        (IndexedDB) abgelegt. Die App besitzt derzeit keine Benutzerkonten und synchronisiert diese
        persönlichen Inhalte nicht mit einem App-Server. Die redaktionellen Inhalte werden separat
        lokal zwischengespeichert.
      </p>

      <h2>Offlinebetrieb und Browserspeicher</h2>
      <p>
        Ein Service Worker speichert App-Dateien und eine begrenzte Zahl redaktioneller Bilder
        lokal, damit Teile der App offline verfügbar bleiben. Die App kann den Browser um
        dauerhaften Speicher bitten; der Browser entscheidet, ob er diesem Wunsch entspricht.
        Browser oder Nutzer können lokale Daten und Caches löschen. Sichere wichtige persönliche
        Daten deshalb regelmäßig.
      </p>

      <h2>Abruf redaktioneller Inhalte</h2>
      <p>
        Für WelliPedia und Futterpflanzen ruft die App öffentliche Inhalte über die
        WordPress-REST-API von welliathome.de ab. Die Anfragen sind Leseanfragen ohne übermittelte
        Anmeldedaten. Dabei werden keine Vogelprofile oder persönlichen Dokumentationseinträge an
        diese API gesendet. Wie bei einer Internetanfrage üblich, können beim aufgerufenen Server
        technische Verbindungsdaten wie IP-Adresse, Zeitpunkt, angeforderte Adresse und
        Browserinformationen anfallen. Verantwortlich für die dortige Verarbeitung und die
        Speicherdauer ist der jeweilige Betreiber. Weitere Informationen findest du in den{' '}
        <SafeLink href="https://welliathome.de/datenschutzerklaerung/">
          Datenschutzhinweisen der Welli@Home-Hauptwebsite
        </SafeLink>
        .
      </p>

      <h2>Backups</h2>
      <p>
        Ein Backup wird nur auf deine Aktion hin erstellt und im Browser als JSON-Datei zum
        Herunterladen oder Teilen bereitgestellt. Es kann persönliche Einträge und Profilbilder
        enthalten und ist derzeit nicht verschlüsselt. Beim Teilen bestimmst du selbst das Ziel; ab
        diesem Schritt gelten zusätzlich die Bedingungen des gewählten Dienstes. Die App lädt die
        Backupdatei nicht auf einen eigenen Server hoch.
      </p>

      <h2>Hosting, externe Links und weitere Empfänger</h2>
      <p>
        Die Datenschutzerklärung der Hauptwebsite nennt die TrafficPlex GmbH (lima-city),
        Konsul-Smidt-Str. 90, 28217 Bremen als Hosting-Anbieter.
      </p>
      <p>
        Wenn du einen externen Link öffnest, verlässt du Welli@Home. Der jeweilige Anbieter
        verarbeitet Daten nach seinen eigenen Datenschutzinformationen.
      </p>

      <h2>Cookies und Reichweitenmessung</h2>
      <p>
        Diese PWA bindet im Anwendungscode keine Reichweitenmessung und keine externen
        Analyse-Skripte ein. Bei der Nutzung externer Angebote gelten zusätzlich die
        Datenschutzinformationen der jeweiligen Anbieter.
      </p>

      <h2>Deine Rechte und Kontakt</h2>
      <p>
        Im Rahmen der geltenden Datenschutzvorschriften kannst du insbesondere Auskunft,
        Berichtigung, Löschung oder Einschränkung der Verarbeitung verlangen und dich bei einer
        Datenschutzaufsichtsbehörde beschweren. Für Anfragen erreichst du die verantwortliche Stelle
        unter <a href="mailto:mail@welliathome.de">mail@welliathome.de</a>.
      </p>
    </LegalPage>
  )
}
