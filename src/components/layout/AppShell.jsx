import { useEffect, useState } from 'react'
import {
  Archive,
  ChartLineUp,
  Files,
  List,
  SidebarSimple,
  X,
  WarningCircle,
} from '@phosphor-icons/react'

import clearanceLogo from '@/assets/clearance-logo.png'
import { AbstractBlueBackground } from '@/components/backgrounds/AbstractBlueBackground'
import { cn } from '@/lib/utils'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'clearance:sidebar-collapsed'

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const navigation = [
  { label: 'Dashboard', path: '/dashboard', icon: ChartLineUp },
  { label: 'Inbox', path: '/inbox', icon: Archive },
  { label: 'Document Comparison', path: '/docs-comparison', icon: Files },
  { label: 'Review queue', path: '/review', icon: WarningCircle, badge: true },
]

export function AppShell({ pathname, navigate, children, reviewCount = null }) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
    } catch {
      // Storage may be blocked; the sidebar still works, it just won't remember its state.
    }
  }, [collapsed])

  function go(path) {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="relative isolate min-h-screen bg-[#d5e4ff] text-[#0F172A]">
      <AbstractBlueBackground className="fixed inset-0 -z-10" />
      <button
        className="fixed left-4 top-4 z-40 rounded-lg bg-[#0F172A] p-2 text-white shadow-lg lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <List size={22} />
      </button>

      {open && (
        <button
          className="fixed inset-0 z-40 bg-[#0F172A]/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[264px] -translate-x-full flex-col bg-gradient-to-b from-[#0A1230] via-[#0F1F45] to-[#1E3A6E] px-4 py-7 text-white transition-[transform,width] duration-200 lg:translate-x-0',
          collapsed ? 'lg:w-[76px]' : 'lg:w-[264px]',
          open && 'translate-x-0',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between px-2',
            collapsed && 'lg:flex-col lg:gap-4 lg:px-0',
          )}
        >
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
            <span
              className={cn(
                'font-display text-[1.375rem] font-semibold tracking-[-0.01em]',
                collapsed && 'lg:hidden',
              )}
            >
              Clearance
            </span>
          </button>
          <button
            className="rounded-md p-2 text-slate-400 hover:bg-slate-800 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
          <button
            className="hidden rounded-md p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white lg:block"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <SidebarSimple size={20} />
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
                title={collapsed ? label : undefined}
                className={cn(
                  'flex w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white',
                  collapsed && 'lg:justify-center lg:px-0',
                  active && 'bg-white/15 text-white hover:bg-white/15',
                )}
              >
                <span className="relative flex shrink-0">
                  <Icon size={21} weight={active ? 'fill' : 'regular'} />
                  {badge && collapsed && (
                    <span className="absolute -right-2.5 -top-2 hidden min-w-[18px] items-center justify-center rounded-full bg-[#D97706] px-1 text-[10px] font-bold leading-[18px] text-white lg:flex">
                      {reviewCount == null ? '—' : reviewCount}
                    </span>
                  )}
                </span>
                <span className={cn('flex-1', collapsed && 'lg:hidden')}>{label}</span>
                {badge && (
                  <span
                    className={cn(
                      'rounded-full bg-[#D97706] px-2 py-0.5 text-xs font-bold text-white',
                      collapsed && 'lg:hidden',
                    )}
                  >
                    {reviewCount == null ? '—' : reviewCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div
          className={cn(
            'mt-auto rounded-xl border border-white/10 bg-white/5 p-4 text-slate-300 backdrop-blur',
            collapsed && 'lg:hidden',
          )}
        >
          <p className="font-semibold text-white">Live pipeline</p>
          <p className="mt-1 text-sm leading-5">
            Counts and review state come from the backend results store.
          </p>
        </div>
      </aside>

      <main
        className={cn(
          'min-h-screen transition-[padding] duration-200',
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]',
        )}
      >
        {children}
      </main>
    </div>
  )
}
