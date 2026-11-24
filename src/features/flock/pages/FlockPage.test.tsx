// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../../../app/App'
import { appDatabase, initializeDatabase } from '../../../data/database/appDatabase'
import { birdRepository } from '../../../data/repositories'
import { sections } from '../../../shared/types/sections'

describe('Mein Schwarm – Benutzeroberfläche', () => {
  afterEach(cleanup)
  beforeEach(async () => {
    await appDatabase.delete()
    await initializeDatabase()
  })
  afterAll(async () => {
    await appDatabase.delete()
  })

  it('zeigt den leeren Zustand und führt durch die Vogel-Erfassung', async () => {
    render(
      <MemoryRouter initialEntries={['/schwarm']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Noch keine Wellensittiche erfasst.')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Ersten Vogel erfassen' }))
    const name = await screen.findByLabelText(/Name/)
    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vogel speichern' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Bitte gib einen Namen ein.')

    fireEvent.change(name, { target: { value: 'Pico' } })
    fireEvent.change(screen.getByLabelText('Geschlecht'), { target: { value: 'male' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vogel speichern' }))
    expect(await screen.findByRole('heading', { name: 'Pico' })).toBeTruthy()
    expect(await birdRepository.list()).toHaveLength(1)
    expect(screen.getAllByText('Hahn').length).toBeGreaterThan(0)
  })

  it('speichert und bearbeitet unvollständige Datumsangaben ohne Zurück-Link', async () => {
    render(
      <MemoryRouter initialEntries={['/schwarm/neu']}>
        <App />
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'Pico' } })
    expect(screen.queryByRole('link', { name: /Zurück/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('Schlupfdatum'), { target: { value: 'Juli 2020' } })
    fireEvent.change(screen.getByLabelText('Einzugsdatum'), { target: { value: '03/23' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vogel speichern' }))
    expect(await screen.findByRole('heading', { name: 'Pico' })).toBeTruthy()
    expect(screen.getByText('Juli 2020')).toBeTruthy()
    expect(screen.getByText('03/23')).toBeTruthy()
    appDatabase.close()
    await appDatabase.open()
    expect((await birdRepository.list())[0]).toMatchObject({
      hatchDate: 'Juli 2020',
      arrivalDate: '03/23',
    })
    fireEvent.click(screen.getByRole('link', { name: 'Profil bearbeiten' }))
    expect(((await screen.findByLabelText('Schlupfdatum')) as HTMLInputElement).value).toBe(
      'Juli 2020',
    )
    expect((screen.getByLabelText('Einzugsdatum') as HTMLInputElement).value).toBe('03/23')
    expect(screen.queryByRole('link', { name: /^← Zurück$/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('Schlupfdatum'), { target: { value: '31.02.2020' } })
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    expect(await screen.findByText(/Bitte gib ein gültiges Datum/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Schlupfdatum'), { target: { value: '15.07.2020' } })
    fireEvent.change(screen.getByLabelText('Einzugsdatum'), { target: { value: '2020' } })
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(async () =>
      expect((await birdRepository.list())[0]).toMatchObject({
        hatchDate: '15.07.2020',
        arrivalDate: '2020',
      }),
    )
  })

  it('öffnet Erinnerungen über den linksbündigen Aktionsbutton mit dem bereitgestellten SVG', async () => {
    render(
      <MemoryRouter initialEntries={['/schwarm']}>
        <App />
      </MemoryRouter>,
    )
    const remindersLink = screen.getByRole('link', { name: 'Erinnerungen' })
    const addBirdLink = screen.getByRole('link', { name: 'Vogel hinzufügen' })
    expect(remindersLink.getAttribute('href')).toBe('/schwarm/erinnerungen')
    expect(remindersLink.parentElement?.classList.contains('flock-page__actions')).toBe(true)
    expect(
      remindersLink.compareDocumentPosition(addBirdLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(remindersLink.querySelector('img')?.getAttribute('src')).toBe(
      '/welli-icons/erinnerung.svg',
    )

    fireEvent.click(remindersLink)
    expect(await screen.findByRole('heading', { name: 'Erinnerungen' })).toBeTruthy()
  })

  it('zeigt für eine unbekannte ID eine verständliche Rückkehrmöglichkeit', async () => {
    render(
      <MemoryRouter initialEntries={['/schwarm/not-a-bird']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Vogelprofil nicht gefunden' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Zurück zu Mein Schwarm' })).toBeTruthy()
  })

  it('zeigt Profile alphabetisch sortiert in der Übersicht', async () => {
    await birdRepository.create({ name: 'Zora', species: 'Wellensittich' })
    await birdRepository.create({ name: 'Änne', species: 'Wellensittich' })
    await birdRepository.create({ name: 'Alf', species: 'Wellensittich' })
    render(
      <MemoryRouter initialEntries={['/schwarm']}>
        <App />
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll('.bird-card h2')).map((item) => item.textContent),
      ).toEqual(['Alf', 'Änne', 'Zora']),
    )
  })

  it('verwendet auf Startkarten und Navigation dieselben bereitgestellten SVG-Dateien', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(document.querySelectorAll('.section-card__icon img')).toHaveLength(4)
    expect(
      document.querySelectorAll('.main-navigation__inner .nav-link:not(.nav-link--home) img'),
    ).toHaveLength(4)
    for (const section of sections) {
      const card = document.querySelector<HTMLAnchorElement>(
        `.section-link[href="${section.path}"]`,
      )
      const navigationLink = document.querySelector<HTMLAnchorElement>(
        `.main-navigation__inner a[href="${section.path}"]`,
      )
      expect(card).toBeTruthy()
      expect(navigationLink).toBeTruthy()
      const cardImage = card?.querySelector<HTMLImageElement>('.section-card__icon img')
      const navigationImage = navigationLink?.querySelector<HTMLImageElement>('img')
      expect(cardImage?.getAttribute('src')).toBe(section.iconSrc)
      expect(navigationImage?.getAttribute('src')).toBe(section.iconSrc)
      expect(cardImage?.getAttribute('aria-hidden')).toBe('true')
      expect(cardImage?.getAttribute('alt')).toBe('')
    }
  })

  it('verwendet das Käfig-SVG nur als Startseiten-Navigationssymbol', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    const homeLink = document.querySelector<HTMLAnchorElement>('.main-navigation a.nav-link--home')
    const icon = homeLink?.querySelector<HTMLImageElement>('img')
    expect(homeLink?.getAttribute('href')).toBe('/')
    expect(homeLink?.textContent).toContain('Start')
    expect(icon?.getAttribute('src')).toBe('/welli-icons/navigation/startseite-kaefig.svg')
    expect(icon?.getAttribute('alt')).toBe('')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.classList.contains('nav-link__icon')).toBe(true)
  })

  it('kennzeichnet den aktiven Menüpunkt weiterhin semantisch', () => {
    render(
      <MemoryRouter initialEntries={['/koernermischungen']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      document
        .querySelector('.main-navigation a[href="/koernermischungen"]')
        ?.getAttribute('aria-current'),
    ).toBe('page')
  })
})
