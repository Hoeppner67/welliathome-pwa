import type { HTMLAttributes, ReactNode } from 'react'
interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  as?: 'article' | 'div'
}
export function Card({ as: Element = 'article', className = '', children, ...props }: CardProps) {
  return (
    <Element className={`card ${className}`.trim()} {...props}>
      {children}
    </Element>
  )
}
