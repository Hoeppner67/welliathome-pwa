export type SectionId = 'flock' | 'feed-mixes' | 'plants' | 'wellipedia'

export interface SectionDefinition {
  id: SectionId
  path: string
  title: string
  subtitle: string
  description: string
  iconSrc: string
}

export const sections: SectionDefinition[] = [
  {
    id: 'flock',
    path: '/schwarm',
    title: 'Mein Schwarm',
    subtitle: 'Profile und Dokumentation',
    description: 'Profile und wichtige Informationen zu deinen Wellensittichen.',
    iconSrc: '/welli-icons/navigation/Schwarm.svg',
  },
  {
    id: 'feed-mixes',
    path: '/koernermischungen',
    title: 'Körnermischungen',
    subtitle: 'Futter verwalten und bestellen',
    description: 'Körnermischungen und Futterbestellungen im Blick behalten.',
    iconSrc: '/welli-icons/navigation/K%C3%B6rnerfutter.svg',
  },
  {
    id: 'plants',
    path: '/futterpflanzen',
    title: 'Futterpflanzen',
    subtitle: 'Futterpflanzen – Datenbank',
    description: 'Pflanzenporträts und Ideen für Futterpflanzen entdecken.',
    iconSrc: '/welli-icons/navigation/Futterpflanzen.svg',
  },
  {
    id: 'wellipedia',
    path: '/wellipedia',
    title: 'WelliPedia',
    subtitle: 'Wellensittich – Wiki',
    description: 'Wissen rund um Gesundheit, Ernährung und Haltung.',
    iconSrc: '/welli-icons/navigation/Wellipedia.svg',
  },
]
