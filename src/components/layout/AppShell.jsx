import { useState } from 'react'
import { Archive, ChartLineUp, Files, List, X, WarningCircle } from '@phosphor-icons/react'

import clearanceLogo from '@/assets/clearance-logo.png'
import { cn } from '@/lib/utils'

const navigation = [
  { label: 'Dashboard', path: '/dashboard', icon: ChartLineUp },
  { label: 'Inbox', path: '/inbox', icon: Archive },
  { label: 'Docs Comparison', path: '/docs-comparison', icon: Files },
  { label: 'Review queue', path: '/review', icon: WarningCircle, badge: true },
]

export function AppShell({ pathname, navigate, children, reviewCount = null }) {
  const [open, setOpen] = useState(false)

  function go(path) {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="min-h-screen bg-[#F3F0E8] text-[#16232B]">
      <button
        className="fixed left-4 top-4 z-40 rounded-lg bg-[#16232B] p-2 text-white shadow-lg lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <List size={22} />
      </button>

      {open && (
        <button
          className="fixed inset-0 z-40 bg-[#16232B]/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[220px] -translate-x-full flex-col bg-[#13232C] px-5 py-7 text-white transition-transform lg:translate-x-0',
          open && 'translate-x-0',
        )}
      >
        <div className="flex items-center justify-between px-2">
          <button
            className="flex items-center gap-3"
            onClick={() => go('/dashboard')}
            aria-label="Clearance home"
          >
            <img
              src={clearanceLogo}
              alt=""
              aria-hidden="true"
              className="h-10 w-10 shrink-0 object-contain"
            />
            <span className="font-serif text-2xl font-semibold tracking-tight">Clearance</span>
          </button>
          <button
            className="rounded-md p-2 text-white/70 hover:bg-white/10 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="mt-12 space-y-2" aria-label="Primary navigation">
          {navigation.map(({ label, path, icon: Icon, badge }) => {
            const active =
              pathname === path ||
              (path === '/inbox' && pathname.startsWith('/inbox/')) ||
              (path === '/docs-comparison' && pathname.startsWith('/docs-comparison')) ||
              (path === '/review' && pathname.startsWith('/review'))
            return (
              <button
                key={path}
                onClick={() => go(path)}
                className={cn(
                  'flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-[15px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white',
                  active && 'bg-[#9A3412] text-white',
                )}
              >
                <Icon size={21} weight={active ? 'fill' : 'regular'} />
                <span className="flex-1">{label}</span>
                {badge && (
                  <span className="rounded-full bg-[#FBEBCF] px-2 py-0.5 text-xs font-bold text-[#8A5300]">
                    {reviewCount == null ? '—' : reviewCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto rounded-xl bg-[#0E5A66] p-4 text-white/70">
          <p className="font-semibold text-white">Live pipeline</p>
          <p className="mt-1 text-sm leading-5">
            Counts and review state come from the backend results store.
          </p>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[220px]">{children}</main>
    </div>
  )
}
