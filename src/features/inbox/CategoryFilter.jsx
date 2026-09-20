import { useEffect, useRef, useState } from 'react'
import { CaretDown, Check, FunnelSimple } from '@phosphor-icons/react'

import { CATEGORY_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS)

export function CategoryFilter({ hidden, counts, onToggle, onShowAll, onHideAll }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const hiddenCount = CATEGORY_KEYS.filter((key) => hidden.includes(key)).length

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white px-4 text-sm font-semibold leading-none text-[#26353D] shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        <FunnelSimple size={16} weight="bold" className="shrink-0" />
        Categories
        {hiddenCount > 0 && (
          <span className="rounded-full bg-[#16232B] px-2 py-0.5 text-xs text-white">
            {hiddenCount} hidden
          </span>
        )}
        <CaretDown
          size={14}
          weight="bold"
          className={cn('shrink-0 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="group"
          aria-label="Show or hide email categories"
          className="absolute right-0 z-30 mt-2 w-72 rounded-xl bg-white p-2 shadow-[0_12px_32px_rgba(22,35,43,0.16)]"
        >
          <div className="flex items-center justify-between px-2 pb-1 pt-1.5 text-xs font-semibold text-[#71808A]">
            <span className="uppercase tracking-[0.08em]">Show categories</span>
            <span className="flex gap-3">
              <button type="button" className="text-[#0E5A66] hover:underline" onClick={onShowAll}>
                Show all
              </button>
              <button type="button" className="text-[#0E5A66] hover:underline" onClick={onHideAll}>
                Hide all
              </button>
            </span>
          </div>
          <ul>
            {CATEGORY_KEYS.map((key) => {
              const visible = !hidden.includes(key)
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={visible}
                    onClick={() => onToggle(key)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-[#26353D] transition-colors hover:bg-[#F6F3EC]"
                  >
                    <span
                      className={cn(
                        'grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors',
                        visible
                          ? 'border-[#0E5A66] bg-[#0E5A66] text-white'
                          : 'border-[#C9C4B6] bg-white text-transparent',
                      )}
                    >
                      <Check size={12} weight="bold" />
                    </span>
                    <span className={cn('flex-1', !visible && 'text-[#8A969B]')}>
                      {CATEGORY_LABELS[key]}
                    </span>
                    <span className="font-mono text-xs text-[#71808A]">{counts[key] ?? 0}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
