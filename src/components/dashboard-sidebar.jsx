import { useState } from 'react'
import {
  CaretDown,
  CaretDoubleLeft,
  ChartBar,
  FolderSimple,
  Gear,
  MagnifyingGlass,
  Question,
  SquaresFour,
  UsersThree,
  X,
} from '@phosphor-icons/react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const navigation = [
  { label: 'Overview', icon: SquaresFour },
  { label: 'Projects', icon: FolderSimple },
  { label: 'Insights', icon: ChartBar },
  { label: 'Team', icon: UsersThree },
]

const accountNavigation = [
  { label: 'Settings', icon: Gear },
  { label: 'Help center', icon: Question },
]

function SidebarNavRow({ active, collapsed, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        'flex min-h-10 w-full items-center rounded-md text-left text-sm font-medium transition-colors duration-200',
        collapsed ? 'justify-center p-2' : 'gap-2 px-2 py-2',
        active
          ? 'bg-blue-50 text-[#4493F8]'
          : 'text-[#7B7B7B] hover:bg-[#F6F6F6] hover:text-[#4A4A4A]',
      )}
    >
      <Icon
        className={cn('h-5 w-5 shrink-0', active ? 'text-[#4493F8]' : 'text-[#A3A3A3]')}
        weight="regular"
        aria-hidden="true"
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
    </button>
  )
}

function SidebarSection({ children, collapsed, label, open, onToggle }) {
  return (
    <section className="pb-2">
      <div className="mb-2">
        {collapsed ? (
          <div className="my-1 h-px bg-[#EEEEEE]" aria-hidden="true" />
        ) : (
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex min-h-10 w-full items-center gap-1.5 rounded-sm px-2 py-2 text-left text-[12px] font-medium leading-[18px] text-[#7B7B7B] transition-colors duration-200 hover:text-[#4A4A4A] lg:min-h-0 lg:px-1 lg:py-1"
          >
            <span>{label}</span>
            <span
              className={cn(
                'rounded-[4px] bg-[#F0F0F0] p-px transition-transform',
                !open && '-rotate-90',
              )}
            >
              <CaretDown className="h-3.5 w-3.5" weight="regular" aria-hidden="true" />
            </span>
          </button>
        )}
        {(collapsed || open) && <div className="space-y-1">{children}</div>}
      </div>
    </section>
  )
}

export function DashboardSidebar({ activeItem, onNavigate, isOpen, onClose, onSearch }) {
  const [collapsed, setCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState({ workspace: true, account: true })

  function selectItem(label) {
    onNavigate(label)
    onClose()
  }

  function toggleSection(section) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        id="dashboard-sidebar"
        data-state={isOpen ? 'open' : 'closed'}
        data-collapsed={collapsed ? 'true' : 'false'}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(18rem,calc(100vw-3rem))] -translate-x-full flex-col overflow-hidden border-r border-[#EEEEEE] bg-[#FAFAFA] px-2 py-2 text-[#4A4A4A] opacity-0 transition-[transform,opacity,width] duration-200 lg:sticky lg:top-0 lg:z-0 lg:h-dvh lg:max-h-dvh lg:min-h-screen lg:translate-x-0 lg:opacity-100 lg:duration-300',
          isOpen && 'translate-x-0 opacity-100',
          collapsed ? 'lg:w-[68px]' : 'lg:w-72',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative mb-2 border-b border-[#EEEEEE] pb-2">
            <div
              className={cn(
                'flex items-center',
                collapsed ? 'justify-center py-1.5' : 'h-[43px] justify-between px-1',
              )}
            >
              {!collapsed && (
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 rounded-md border border-[#EEEEEE] bg-white p-1.5 text-left transition-colors duration-200 hover:bg-[#F6F6F6]"
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-[#4493F8] text-xs font-semibold text-white">
                    N
                  </span>
                  <span className="max-w-[140px] truncate text-sm font-medium text-[#4A4A4A]">
                    Northstar
                  </span>
                  <CaretDown
                    className="h-4 w-4 shrink-0 text-[#7B7B7B]"
                    weight="regular"
                    aria-hidden="true"
                  />
                </button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="text-[#7B7B7B] hover:bg-[#F0F0F0] hover:text-[#4A4A4A] lg:flex"
                onClick={() => {
                  if (isOpen) {
                    onClose()
                  } else {
                    setCollapsed((current) => !current)
                  }
                }}
                aria-label={
                  isOpen ? 'Close navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'
                }
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isOpen ? <X className="h-4 w-4 lg:hidden" aria-hidden="true" /> : null}
                <CaretDoubleLeft
                  className={cn('h-4 w-4', isOpen && 'hidden lg:block', collapsed && 'rotate-180')}
                  weight="regular"
                  aria-hidden="true"
                />
              </Button>
            </div>

            {collapsed ? (
              <button
                type="button"
                aria-label="Search"
                title="Search (⌘ K)"
                onClick={onSearch}
                className="flex h-10 w-full items-center justify-center rounded-md border border-[#EEEEEE] bg-white text-xs font-medium text-[#7B7B7B] transition-colors duration-200 hover:bg-[#F6F6F6] lg:h-[34px]"
              >
                ⌘K
              </button>
            ) : (
              <button
                type="button"
                aria-label="Search"
                onClick={onSearch}
                className="flex h-10 w-full min-w-0 items-center rounded-md border border-[#EEEEEE] bg-white pl-2 text-left text-sm text-[#7B7B7B] transition-colors duration-200 hover:bg-[#F6F6F6] lg:h-[34px]"
              >
                <span className="min-w-0 flex-1 truncate">Search</span>
                <span className="mr-1 flex shrink-0 items-center rounded-sm border border-[#EEEEEE] bg-[#F6F6F6] px-1.5 py-0.5 text-xs font-medium text-[#7B7B7B]">
                  ⌘ K
                </span>
                <MagnifyingGlass
                  className="mr-2 h-4 w-4 text-[#A3A3A3]"
                  weight="regular"
                  aria-hidden="true"
                />
              </button>
            )}
          </div>

          <nav className="min-h-0 flex-1 overflow-y-hidden px-0" aria-label="Main navigation">
            <SidebarSection
              collapsed={collapsed}
              label="Workspace"
              open={openSections.workspace}
              onToggle={() => toggleSection('workspace')}
            >
              {navigation.map(({ label, icon: Icon }) => (
                <SidebarNavRow
                  key={label}
                  active={activeItem === label}
                  collapsed={collapsed}
                  icon={Icon}
                  label={label}
                  onClick={() => selectItem(label)}
                />
              ))}
            </SidebarSection>

            <SidebarSection
              collapsed={collapsed}
              label="Account"
              open={openSections.account}
              onToggle={() => toggleSection('account')}
            >
              {accountNavigation.map(({ label, icon: Icon }) => (
                <SidebarNavRow
                  key={label}
                  active={activeItem === label}
                  collapsed={collapsed}
                  icon={Icon}
                  label={label}
                  onClick={() => selectItem(label)}
                />
              ))}
            </SidebarSection>
          </nav>
        </div>

        <div className="mt-2 shrink-0 px-1">
          <Separator className="mb-4 bg-[#EEEEEE]" />
          <div className={cn('flex items-center gap-3', collapsed ? 'justify-center' : 'px-1')}>
            <Avatar>
              <AvatarFallback className="bg-[#4493F8] text-white">AM</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#4A4A4A]">Alex Morgan</p>
                  <p className="truncate text-xs text-[#7B7B7B]">alex@example.com</p>
                </div>
                <Badge variant="outline" className="border-[#EEEEEE] text-[10px] text-[#7B7B7B]">
                  Free
                </Badge>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
