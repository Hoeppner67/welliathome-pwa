import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../shared/components/Card'
import { Icon } from '../../shared/components/Icon'
import { sections } from '../../shared/types/sections'
import { getBackupStatus } from '../backup/backupService'
import { reminderRepository } from '../../data/repositories'
import { localIsoDate } from '../../utils/date'
import '../../styles/backup.css'
import { version } from '../../../package.json'

const backupDateFormat = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
})

export function HomePage() {
  const [backupStatus, setBackupStatus] = useState<Awaited<ReturnType<typeof getBackupStatus>>>()
  const [backupStatusError, setBackupStatusError] = useState(false)
  const [dueReminderCount, setDueReminderCount] = useState(0)
  const [reminderStatusError, setReminderStatusError] = useState(false)

  useEffect(() => {
    let active = true
    void getBackupStatus()
      .then((status) => {
        if (active) setBackupStatus(status)
      })
      .catch(() => {
        if (active) setBackupStatusError(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    void reminderRepository
      .list()
      .then((reminders) => {
        if (active) {
          setDueReminderCount(
            reminders.filter(
              (reminder) => !reminder.completed && reminder.dueDate <= localIsoDate(),
            ).length,
          )
        }
      })
      .catch(() => {
        if (active) setReminderStatusError(true)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <section aria-labelledby="home-title">
      <div className="page-intro">
        <h1 id="home-title">Alles für deinen Schwarm</h1>
        <p className="page-intro__copy">Wähle einen Bereich, um loszulegen.</p>
      </div>
      <div className="section-grid">
        {sections.map((section, index) => (
          <Link className="section-link" to={section.path} key={section.id}>
            <Card className={`section-card section-card--${index + 1}`}>
              <span className="section-card__icon">
                <img src={section.iconSrc} alt="" aria-hidden="true" />
              </span>
              <div className="section-card__body">
                <h2>{section.title}</h2>
                <p className="section-card__subtitle">
                  {section.id === 'plants' ? 'Frischfutter – Datenbank' : section.subtitle}
                </p>
                <p className="section-card__description">{section.description}</p>
              </div>
              <Icon name="arrow" className="section-card__arrow" />
            </Card>
          </Link>
        ))}
      </div>
      {reminderStatusError && (
        <aside className="home-backup-status home-backup-status--error" role="alert">
          <p>Der Status fälliger Erinnerungen konnte nicht geladen werden.</p>
        </aside>
      )}
      {dueReminderCount > 0 && (
        <aside className="home-backup-status">
          <Link to="/schwarm/erinnerungen">
            {dueReminderCount} {dueReminderCount === 1 ? 'Erinnerung ist' : 'Erinnerungen sind'}{' '}
            fällig
          </Link>
        </aside>
      )}
      {backupStatusError && (
        <aside className="home-backup-status home-backup-status--error" role="alert">
          <p>Der Datensicherungsstatus konnte nicht geladen werden.</p>
        </aside>
      )}
      {backupStatus?.needsBackup && (
        <aside className="home-backup-status home-backup-status--warning" role="status">
          <h2>Datensicherung empfohlen</h2>
          <p>
            {backupStatus.lastBackup
              ? `Letzter Backup-Export angestoßen am ${backupDateFormat.format(new Date(backupStatus.lastBackup))}.`
              : 'Für deine persönlichen Daten wurde noch kein Backup-Export gestartet.'}
          </p>
        </aside>
      )}
      {backupStatus && !backupStatus.needsBackup && backupStatus.lastBackup && (
        <p className="home-backup-status" role="status">
          Letzte Sicherung: {backupDateFormat.format(new Date(backupStatus.lastBackup))}
        </p>
      )}
      <nav className="backup-home-link" aria-label="Weitere Informationen">
        <div className="backup-home-link__legal">
          <Link to="/impressum">Impressum</Link>
          <Link to="/datenschutz">Datenschutz</Link>
        </div>
        <Link
          className={`button button--primary backup-home-link__action ${
            backupStatus?.needsBackup
              ? 'backup-home-link__action--recommended'
              : 'backup-home-link__action--quiet'
          }`}
          to="/datensicherung"
        >
          Datensicherung
        </Link>
      </nav>
      <p className="home-app-version">Version {version}</p>
    </section>
  )
}
