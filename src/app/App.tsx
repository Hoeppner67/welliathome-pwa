import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { HomePage } from '../features/home/HomePage'
import { FeedMixesPage } from '../features/feed-mixes/pages/FeedMixesPage'
import { NotFoundPage } from '../features/sections/NotFoundPage'
import { FlockPage } from '../features/flock/pages/FlockPage'
import { BirdCreatePage } from '../features/flock/pages/BirdCreatePage'
import { BirdEditPage } from '../features/flock/pages/BirdEditPage'
import { RemindersPage } from '../features/flock/pages/RemindersPage'

const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const BackupPage = lazy(() =>
  import('../features/backup/pages/BackupPage').then((module) => ({ default: module.BackupPage })),
)
const BirdDetailPage = lazy(() =>
  import('../features/flock/pages/BirdDetailPage').then((module) => ({
    default: module.BirdDetailPage,
  })),
)
const EditorialDetailPage = lazy(() =>
  import('../features/content/ContentPages').then((module) => ({
    default: module.EditorialDetailPage,
  })),
)
const PlantsPage = lazy(() =>
  import('../features/content/ContentPages').then((module) => ({ default: module.PlantsPage })),
)
const WelliPediaPage = lazy(() =>
  import('../features/content/ContentPages').then((module) => ({ default: module.WelliPediaPage })),
)
const ImprintPage = lazy(() =>
  import('../features/legal/LegalPages').then((module) => ({ default: module.ImprintPage })),
)
const PrivacyPage = lazy(() =>
  import('../features/legal/LegalPages').then((module) => ({ default: module.PrivacyPage })),
)

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="schwarm" element={<FlockPage />} />
        <Route path="schwarm/erinnerungen" element={<RemindersPage />} />
        <Route path="schwarm/neu" element={<BirdCreatePage />} />
        <Route path="schwarm/:birdId" element={<BirdDetailPage />} />
        <Route path="schwarm/:birdId/bearbeiten" element={<BirdEditPage />} />
        <Route path="koernermischungen" element={<FeedMixesPage />} />
        <Route path="datensicherung" element={<BackupPage />} />
        <Route path="einstellungen" element={<Navigate to="/synchronisation" replace />} />
        <Route path="synchronisation" element={<SettingsPage />} />
        <Route path="oauth/pcloud/callback" element={<Navigate to="/" replace />} />
        <Route path="futterpflanzen" element={<PlantsPage />} />
        <Route path="futterpflanzen/:contentId" element={<EditorialDetailPage source="plants" />} />
        <Route path="wellipedia" element={<WelliPediaPage />} />
        <Route path="wellipedia/:contentId" element={<EditorialDetailPage source="wellipedia" />} />
        <Route path="impressum" element={<ImprintPage />} />
        <Route path="datenschutz" element={<PrivacyPage />} />
        <Route path="start" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
