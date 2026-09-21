import * as React from 'react'

import { cn } from '@/lib/utils'

const Avatar = React.forwardRef(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn('relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
))
Avatar.displayName = 'Avatar'

const AvatarImage = React.forwardRef(({ className, alt = '', ...props }, ref) => (
  <img
    ref={ref}
    className={cn('aspect-square h-full w-full object-cover', className)}
    alt={alt}
    {...props}
  />
))
AvatarImage.displayName = 'AvatarImage'

const AvatarFallback = React.forwardRef(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-[#E2E8F0] text-xs font-semibold text-[#475569]',
      className,
    )}
    {...props}
  />
))
AvatarFallback.displayName = 'AvatarFallback'

export { Avatar, AvatarImage, AvatarFallback }
