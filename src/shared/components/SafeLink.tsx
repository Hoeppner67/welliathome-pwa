import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { classifyLink } from '../links/linkPolicy'

export function SafeLink({
  href,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> & {
  href: string
  children: ReactNode
}) {
  const link = classifyLink(href)
  if (!link) return <span>{children}</span>
  return (
    <a
      {...props}
      href={link.href}
      {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  )
}
