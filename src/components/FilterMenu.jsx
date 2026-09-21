import { useEffect, useRef, useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'

import { cn } from '@/lib/utils'

/**
 * Multi-select filter dropdown, styled like the inbox category filter.
 * `options` are { key, label, count }; `selected` is the list of ticked keys.
 * The button turns navy and shows a count while any option is unticked.
 */
export function FilterMenu({
  id,
  label,
  title,
  icon: Icon,
  options,
  selected,
  onChange,
  align = 'left',
  className,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const filtered = selected.length < options.length

  useEffect(() => {
    if (!open) return undefined

    function closeOnOutsideClick(event) {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function toggle(key) {
    onChange(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key])
  }

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
          filtered
            ? 'bg-[#0F172A] text-white'
            : 'border border-slate-200 bg-white text-[#475569] hover:bg-[#F8FAFC]',
        )}
      >
        {Icon && <Icon size={17} aria-hidden="true" />}
        {label}
        {filtered && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{selected.length}</span>
        )}
        <CaretDown
          size={15}
          aria-hidden="true"
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={title}
          className={cn(
            'absolute z-20 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b border-[#E2E8F0] pb-3">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]">
              {title}
            </span>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => onChange(options.map((option) => option.key))}
                className="text-[#0F172A] hover:underline"
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[#64748B] hover:text-[#0F172A] hover:underline"
              >
                Hide all
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {options.map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[#1E293B] hover:bg-[#F8FAFC]"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.key)}
                  onChange={() => toggle(option.key)}
                  className="h-4 w-4 shrink-0 accent-[#0F172A]"
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className="font-mono text-xs text-[#64748B]">{option.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
