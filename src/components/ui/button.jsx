import * as React from 'react'
import { cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'group relative isolate inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:ring-offset-2 motion-safe:active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[#0F172A] text-white hover:bg-[#1E293B]',
        outline: 'border border-[#0F172A] bg-transparent text-[#0F172A] hover:bg-slate-100',
        ghost: 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#475569]',
        secondary: 'bg-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]',
      },
      size: {
        default: 'h-9 px-3 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-lg px-5',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

const Button = React.forwardRef(
  ({ children, className, variant, size, type = 'button', ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      type={type}
      {...props}
    >
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export { Button, buttonVariants }
