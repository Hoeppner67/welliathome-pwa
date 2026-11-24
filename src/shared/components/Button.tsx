import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  children: ReactNode
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', children, ...props },
  ref,
) {
  return (
    <button ref={ref} className={`button button--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  )
})
