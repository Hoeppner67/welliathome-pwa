import type { ReactNode } from 'react'
import { Card } from '../../../shared/components/Card'
import { Icon, type IconName } from '../../../shared/components/Icon'

export function DocumentationAccordion({
  title,
  icon,
  children,
}: {
  title: string
  icon: IconName
  children: ReactNode
}) {
  return (
    <Card className="documentation-card">
      <details className="documentation-accordion">
        <summary className="documentation-accordion__summary">
          <Icon name={icon} className="documentation-accordion__icon" />
          <span>{title}</span>
        </summary>
        <div className="documentation-accordion__content">{children}</div>
      </details>
    </Card>
  )
}
