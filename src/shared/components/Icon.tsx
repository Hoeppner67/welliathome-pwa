import type { SVGProps } from 'react'

const paths = {
  bird: (
    <>
      <path d="M16 7h.01" />
      <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-4-4h-1a6 6 0 0 0-6 6v.1L6 12l-2 1-1 5Z" />
      <path d="m20 7 2 .5-2 .5" />
      <path d="M10 18v3" />
      <path d="M14 17.75V21" />
      <path d="M7 18a6 6 0 0 0 3-5.1" />
    </>
  ),
  wheat: (
    <>
      <path d="m2 22 14-14" />
      <path d="M3 14c3 0 5 2 5 5" />
      <path d="M7 10c3 0 5 2 5 5" />
      <path d="M11 6c3 0 5 2 5 5" />
      <path d="M16 8c-1-3 0-5 3-6 2 2 2 4 0 6" />
      <path d="M16 8c3-1 5 0 6 3-2 2-4 2-6 0" />
    </>
  ),
  sprout: (
    <>
      <path d="M11 20A7 7 0 0 1 4 13V6a7 7 0 0 1 7 7Z" />
      <path d="M13 20a7 7 0 0 0 7-7V6a7 7 0 0 0-7 7Z" />
      <path d="M12 22v-9" />
    </>
  ),
  bookOpen: (
    <>
      <path d="M12 7v14" />
      <path d="M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13h-5a4 4 0 0 0-4 3 4 4 0 0 0-4-3Z" />
    </>
  ),
  note: (
    <>
      <path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </>
  ),
  health: (
    <>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21l8.84-8.61a5.5 5.5 0 0 0 0-7.78Z" />
      <path d="M7 12h3l1.5-3 2.5 6 1.5-3H18" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M6 3v5a6 6 0 0 0 12 0V3" />
      <path d="M4 3h4" />
      <path d="M16 3h4" />
      <path d="M12 14v2a5 5 0 0 0 10 0v-1" />
      <circle cx="22" cy="13" r="2" />
    </>
  ),
  scale: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M8 7h8l3.5 11.5A2 2 0 0 1 17.6 21H6.4a2 2 0 0 1-1.9-2.5L8 7Z" />
      <path d="M13.5 11.5v4.2a1.8 1.8 0 0 1-3 1.3" />
      <circle cx="12" cy="12.8" r="1.5" />
    </>
  ),
  capsule: (
    <>
      <path d="M10.5 20.5 20 11a5.66 5.66 0 0 0-8-8l-9.5 9.5a5.66 5.66 0 0 0 8 8Z" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 17v3h14v-3" />
    </>
  ),
  folderSync: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path
        d="M7 11.5h9m-1.8-1.8 1.8 1.8-1.8 1.8M17 16H8m1.8-1.8L8 16l1.8 1.8"
        strokeWidth="1.25"
      />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </>
  ),
  delete: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </>
  ),
} as const

export type IconName = keyof typeof paths

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
}

export function Icon({ name, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
