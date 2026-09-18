import * as React from 'react'
import { cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'group relative isolate inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'rounded-lg border border-[#d85a00] bg-[#fd6100] text-white shadow-[0_1px_2px_rgba(176,58,0,0.25)] hover:brightness-[1.03] active:brightness-[0.98]',
        outline: 'border border-[#F0F0F0] bg-white text-[#4A4A4A] hover:bg-[#F6F6F6]',
        ghost: 'text-[#7B7B7B] hover:bg-[#F6F6F6] hover:text-[#4A4A4A]',
        secondary: 'bg-[#F0F0F0] text-[#4A4A4A] hover:bg-[#F6F6F6]',
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

const Button = React.forwardRef(({ children, className, variant, size, type = 'button', ...props }, ref) => (
  <button
    className={cn(buttonVariants({ variant, size, className }))}
    ref={ref}
    type={type}
    {...props}
  >
    {variant === 'default' || variant === undefined ? (
      <>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_2px_0_0_rgba(255,213,94,0.9),inset_0_-2px_0_0_rgba(177,53,0,0.18)]"
          style={{
            backgroundImage: 'linear-gradient(to bottom, #ffbf30 0%, #ff9704 11%, #ff7c00 52%, #fd6100 100%)',
          }}
        />
        <span className="relative z-10 inline-flex items-center">{children}</span>
      </>
    ) : children}
  </button>
))
Button.displayName = 'Button'

export { Button, buttonVariants }
