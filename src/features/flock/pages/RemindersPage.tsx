import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BirdProfile, NewEntity, Reminder } from '../../../models'
import { birdRepository, reminderRepository } from '../../../data/repositories'
import { Button } from '../../../shared/components/Button'
import { Card } from '../../../shared/components/Card'
import { localIsoDate } from '../../../utils/date'
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog'
import '../../../styles/flock.css'
import { createReminderCalendarFile, reminderCalendarFileName } from '../services/reminderCalendar'
import { ReminderForm } from './ReminderForm'

interface ReminderGroup {
  id: string
  title: string
  reminders: Reminder[]
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function formatReminderDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function sortByDueDate(reminders: Reminder[]): Reminder[] {
  return [...reminders].sort((left, right) => left.dueDate.localeCompare(right.dueDate))
}

export function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [birds, setBirds] = useState<BirdProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Reminder>()
  const [busyReminderId, setBusyReminderId] = useState('')
  const [deleting, setDeleting] = useState<Reminder | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [savedReminders, savedBirds] = await Promise.all([
        reminderRepository.list(),
        birdRepository.list(),
      ])
      setReminders(savedReminders)
      setBirds(savedBirds)
    } catch {
      setLoadError(
        'Erinnerungen konnten nicht geladen werden. Prüfe, ob der lokale Datenbankspeicher verfügbar ist.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const sortedBirds = useMemo(
    () => [...birds].sort((left, right) => left.name.localeCompare(right.name, 'de-DE')),
    [birds],
  )
  const birdNames = useMemo(() => new Map(birds.map((bird) => [bird.id, bird.name])), [birds])
  const today = localIsoDate()
  const nextWeek = addDays(today, 7)
  const openReminders = reminders.filter((reminder) => !reminder.completed)
  const groups: ReminderGroup[] = [
    {
      id: 'due',
      title: 'Fällig',
      reminders: sortByDueDate(openReminders.filter((reminder) => reminder.dueDate <= today)),
    },
    {
      id: 'soon',
      title: 'Bald fällig',
      reminders: sortByDueDate(
        openReminders.filter(
          (reminder) => reminder.dueDate > today && reminder.dueDate <= nextWeek,
        ),
      ),
    },
    {
      id: 'later',
      title: 'Später',
      reminders: sortByDueDate(openReminders.filter((reminder) => reminder.dueDate > nextWeek)),
    },
    {
      id: 'completed',
      title: 'Erledigt',
      reminders: [...reminders]
        .filter((reminder) => reminder.completed)
        .sort((left, right) => right.dueDate.localeCompare(left.dueDate)),
    },
  ]

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
    setActionError('')
    setNotice('')
  }

  function openEdit(reminder: Reminder) {
    setEditing(reminder)
    setFormOpen(true)
    setActionError('')
    setNotice('')
  }

  async function saveReminder(input: NewEntity<Reminder>) {
    if (editing) {
      const saved = await reminderRepository.update(editing.id, input)
      if (!saved) throw new Error('Die Erinnerung wurde nicht gefunden.')
      setReminders((current) =>
        sortByDueDate(current.map((item) => (item.id === saved.id ? saved : item))),
      )
      setNotice('Erinnerung wurde geändert.')
    } else {
      const saved = await reminderRepository.create(input)
      setReminders((current) => sortByDueDate([...current, saved]))
      setNotice('Erinnerung wurde gespeichert.')
    }
    setEditing(undefined)
    setFormOpen(false)
    setActionError('')
  }

  async function toggleCompleted(reminder: Reminder) {
    setBusyReminderId(reminder.id)
    setActionError('')
    setNotice('')
    try {
      const saved = await reminderRepository.update(reminder.id, {
        completed: !reminder.completed,
      })
      if (!saved) throw new Error('Die Erinnerung wurde nicht gefunden.')
      setReminders((current) => current.map((item) => (item.id === saved.id ? saved : item)))
    } catch {
      setActionError('Der Status der Erinnerung konnte nicht gespeichert werden.')
    } finally {
      setBusyReminderId('')
    }
  }

  async function deleteReminder() {
    if (!deleting) return
    setDeletingBusy(true)
    setActionError('')
    setNotice('')
    try {
      if (!(await reminderRepository.delete(deleting.id))) {
        throw new Error('Die Erinnerung wurde nicht gefunden.')
      }
      setReminders((current) => current.filter((item) => item.id !== deleting.id))
      setDeleting(null)
      setNotice('Erinnerung wurde gelöscht.')
    } catch {
      setActionError('Die Erinnerung konnte nicht gelöscht werden. Bitte versuche es erneut.')
    } finally {
      setDeletingBusy(false)
    }
  }

  function addToCalendar(reminder: Reminder) {
    setActionError('')
    setNotice('')
    try {
      const file = createReminderCalendarFile(reminder, birdNames.get(reminder.birdId ?? ''))
      const objectUrl = URL.createObjectURL(file)
      const revokeObjectUrl = URL.revokeObjectURL.bind(URL)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = reminderCalendarFileName(reminder)
      try {
        document.body.append(link)
        link.click()
      } finally {
        link.remove()
        window.setTimeout(() => revokeObjectUrl(objectUrl), 1000)
      }
      setNotice('Kalenderdatei wurde zum Download bereitgestellt.')
    } catch {
      setActionError('Kalenderdatei konnte nicht erstellt werden. Bitte versuche es erneut.')
    }
  }

  return (
    <section className="reminders-page" aria-labelledby="reminders-title">
      <header className="page-intro">
        <h1 id="reminders-title">Erinnerungen</h1>
        <p className="page-intro__copy">Aufgaben und Termine im Blick behalten</p>
      </header>

      <div className="reminders-page__actions">
        <Button
          type="button"
          className="add-button"
          aria-label="Erinnerung hinzufügen"
          title="Erinnerung hinzufügen"
          onClick={openCreate}
        >
          <img src="/welli-icons/add.svg" alt="" aria-hidden="true" />
        </Button>
      </div>
      {notice && (
        <p className="flock-message flock-message--success" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="flock-message flock-message--error" role="alert">
          {actionError}
        </p>
      )}
      {formOpen && (
        <ReminderForm
          key={editing?.id ?? 'new'}
          birds={sortedBirds}
          reminder={editing}
          onSave={saveReminder}
          onCancel={() => {
            setFormOpen(false)
            setEditing(undefined)
          }}
        />
      )}
      {loading ? (
        <p role="status">Erinnerungen werden geladen …</p>
      ) : loadError ? (
        <div className="flock-message flock-message--error" role="alert">
          <p>{loadError}</p>
          <Button type="button" variant="secondary" onClick={() => void loadData()}>
            Erneut versuchen
          </Button>
        </div>
      ) : reminders.length === 0 ? (
        <Card className="reminders-empty">
          <h2>Noch keine Erinnerungen gespeichert.</h2>
          <p>Lege eine Erinnerung an, damit wichtige Aufgaben nicht in Vergessenheit geraten.</p>
          <Button type="button" onClick={openCreate}>
            Erste Erinnerung hinzufügen
          </Button>
        </Card>
      ) : (
        groups.map(
          (group) =>
            group.reminders.length > 0 && (
              <section
                className="reminders-group"
                key={group.id}
                aria-labelledby={`reminders-${group.id}-title`}
              >
                <h2 id={`reminders-${group.id}-title`}>
                  {group.title} ({group.reminders.length})
                </h2>
                <ul className="reminders-list">
                  {group.reminders.map((reminder) => (
                    <li key={reminder.id}>
                      <article className="card reminder-card">
                        <div className="reminder-card__header">
                          <h3>{reminder.title}</h3>
                          <Button
                            type="button"
                            variant="secondary"
                            className="reminder-calendar-button"
                            aria-label={`In Kalender eintragen: ${reminder.title}`}
                            title="In Kalender eintragen"
                            onClick={() => addToCalendar(reminder)}
                          >
                            <img src="/welli-icons/kalender.svg" alt="" aria-hidden="true" />
                          </Button>
                        </div>
                        <p className="reminder-card__meta">
                          Fällig am {formatReminderDate(reminder.dueDate)} · {reminder.reminderType}
                          {reminder.birdId
                            ? ` · ${birdNames.get(reminder.birdId) ?? 'Vogelprofil nicht gefunden'}`
                            : ''}
                        </p>
                        {reminder.description && (
                          <p className="reminder-card__description">{reminder.description}</p>
                        )}
                        <div className="reminder-card__actions">
                          <Button
                            type="button"
                            variant="secondary"
                            className={reminder.completed ? '' : 'reminder-complete-button'}
                            disabled={busyReminderId === reminder.id}
                            onClick={() => void toggleCompleted(reminder)}
                          >
                            {reminder.completed ? 'Als offen markieren' : 'Als erledigt markieren'}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => openEdit(reminder)}
                          >
                            Bearbeiten
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setDeleting(reminder)}
                          >
                            Löschen
                          </Button>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )
      )}
      {deleting && (
        <ConfirmDeleteDialog
          title="Erinnerung löschen?"
          description={`„${deleting.title}“ wird dauerhaft von diesem Gerät gelöscht.`}
          confirmLabel="Erinnerung löschen"
          busy={deletingBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void deleteReminder()}
        />
      )}
    </section>
  )
}
