import {
  BarChart3,
  ChevronDown,
  CircleHelp,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Projects', icon: FolderKanban },
  { label: 'Insights', icon: BarChart3 },
  { label: 'Team', icon: Users },
]

export function DashboardSidebar({ activeItem, onNavigate, isOpen, onClose }) {
  return (
    <>
      {isOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col border-r border-slate-800 bg-slate-950 px-4 py-5 text-slate-300 transition-transform lg:static lg:z-0 lg:translate-x-0',
          isOpen && 'translate-x-0',
        )}
      >
        <div className="flex items-center justify-between px-2">
          <a href="#overview" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-slate-950">N</span>
            <span className="text-base font-semibold tracking-tight text-white">Northstar</span>
          </a>
          <Button variant="ghost" size="icon" className="text-slate-500 hover:bg-slate-800 hover:text-white lg:hidden" onClick={onClose} aria-label="Close navigation">
            <span aria-hidden="true">×</span>
          </Button>
        </div>

        <button className="mt-8 flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-left hover:border-slate-700" type="button">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500/15 text-xs font-semibold text-indigo-300">HW</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-100">Hackathon workspace</span>
            <span className="block text-xs text-slate-500">24 members</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
        </button>

        <nav className="mt-8 flex-1" aria-label="Main navigation">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Workspace</p>
          <div className="mt-3 space-y-1">
            {navigation.map(({ label, icon: Icon }) => (
              <button
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  activeItem === label ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
                )}
                key={label}
                onClick={() => {
                  onNavigate(label)
                  onClose()
                }}
                type="button"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <p className="mt-8 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Account</p>
          <div className="mt-3 space-y-1">
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-200" type="button">
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </button>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-200" type="button">
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
              Help center
            </button>
          </div>
        </nav>

        <div>
          <Separator className="mb-4 bg-slate-800" />
          <div className="flex items-center gap-3 px-2">
            <Avatar>
              <AvatarFallback className="bg-indigo-500 text-white">AM</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-200">Alex Morgan</p>
              <p className="truncate text-xs text-slate-500">alex@example.com</p>
            </div>
            <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-500">Free</Badge>
          </div>
        </div>
      </aside>
    </>
  )
}
