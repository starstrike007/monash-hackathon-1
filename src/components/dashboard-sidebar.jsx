import { useState } from 'react'

import {
  WrangleAgentsIcon,
  WrangleAnalyticsIcon,
  WrangleCandidatesIcon,
  WrangleCaretDownIcon,
  WrangleDashboardIcon,
  WrangleHandshakeIcon,
  WrangleInboxIcon,
  WrangleLibraryIcon,
  WrangleOutreachIcon,
  WranglePlusIcon,
  WrangleSourcingIcon,
} from '@/components/icons/wrangler-icons'
import { cn } from '@/lib/utils'

const navigation = [
  { label: 'Dashboard', href: '/dashboard', icon: WrangleDashboardIcon },
  { label: 'Sourcing', href: '/sourcing', icon: WrangleSourcingIcon },
  { label: 'Outreach', href: '/outreach', icon: WrangleOutreachIcon },
  { label: 'Inbox', href: '/inbox', icon: WrangleInboxIcon },
  { label: 'Candidates', href: '/candidates', icon: WrangleCandidatesIcon },
  { label: 'Analytics', href: '/analytics', icon: WrangleAnalyticsIcon },
  { label: 'Library', href: '/library', icon: WrangleLibraryIcon },
  { label: 'Agents', href: '/agents', icon: WrangleAgentsIcon, badge: 'Beta' },
]

function SidebarNavItem({ active, href, icon: Icon, label, badge, onSelect }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault()
        onSelect(label)
      }}
      className={cn(
        'flex h-[33px] w-[272px] items-center rounded-[8px] p-[6px] text-[14px] leading-[21px] transition-colors duration-200 hover:duration-0',
        active
          ? 'bg-[#F0F0F0] text-[#4A4A4A]'
          : 'text-[#7B7B7B] hover:bg-[#F6F6F6] hover:text-[#4A4A4A]',
      )}
    >
      <span className="mr-2 flex h-4 w-4 shrink-0 items-center">
        <Icon
          className={cn(
            'h-5 w-5 transition-colors duration-200',
            active ? 'text-[#7B7B7B]' : 'text-[#A3A3A3]',
          )}
        />
      </span>
      <span className="flex h-[21px] min-w-0 flex-1 items-center justify-between overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_90%,transparent_100%)]">
        {label}
      </span>
      {badge ? (
        <span className="ml-auto flex h-[19px] shrink-0 items-center rounded-[4px] bg-[#F6F6F6] px-1.5 py-1 text-[11px] leading-[11px] text-[#7B7B7B]">
          {badge}
        </span>
      ) : null}
    </a>
  )
}

function CollectionsHeader({ open, onCreate, onToggle }) {
  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className="group flex h-[26px] w-[272px] select-none items-center gap-[6.4px] rounded-[6px] p-1 text-[12px] font-medium leading-[18px] text-[#7B7B7B] transition-all duration-200 hover:bg-[#F6F6F6] hover:duration-0"
    >
      <span>Collections</span>
      <span className="flex h-4 w-4 items-center justify-center rounded-[4px] bg-[#F0F0F0] p-px transition-transform duration-200">
        <WrangleCaretDownIcon className={cn('h-3.5 w-3.5', !open && '-rotate-90')} />
      </span>
      <button
        type="button"
        aria-label="New collection"
        onClick={(event) => {
          event.stopPropagation()
          onCreate()
        }}
        className="ml-auto mr-1 flex h-[17px] w-[17px] items-center justify-center rounded-[4px] p-[1.5px] text-[#7B7B7B] transition-all duration-200 hover:bg-[#F0F0F0] hover:text-[#4A4A4A]"
      >
        <WranglePlusIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function WrangleSidebar({
  activeItem = 'Dashboard',
  onNavigate = () => {},
  onCreateCollection = () => {},
}) {
  const [collectionsOpen, setCollectionsOpen] = useState(true)

  return (
    <div
      className="flex h-[451px] min-h-0 w-[288px] flex-none flex-col px-2 text-black"
      style={{
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        lineHeight: 1.5,
      }}
    >
      <div className="mb-2 h-[264px] w-[272px]">
        <nav aria-label="Main navigation" className="h-[264px] w-[272px]">
          {navigation.map((item) => (
            <SidebarNavItem
              key={item.label}
              {...item}
              active={activeItem === item.label}
              onSelect={onNavigate}
            />
          ))}
        </nav>
      </div>

      <div className="w-[272px] pb-2">
        <div className="mb-2 w-[272px]">
          <CollectionsHeader
            open={collectionsOpen}
            onCreate={onCreateCollection}
            onToggle={() => setCollectionsOpen((current) => !current)}
          />
          {collectionsOpen ? (
            <div className="h-[36px] w-[272px]">
              <button
                type="button"
                onClick={() => onNavigate('VC Investors')}
                className="group flex h-[36px] w-[272px] items-center rounded-[8px] p-[6px] text-left text-[14px] leading-[21px] text-[#7B7B7B] transition-all duration-200 hover:bg-[#F6F6F6] hover:duration-0"
              >
                <span className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[#FFF4D8] text-[#F1B51C]">
                  <WrangleHandshakeIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">VC Investors</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function DashboardSidebar({
  activeItem = 'Dashboard',
  onNavigate = () => {},
  isOpen = false,
  onClose = () => {},
  onCreateCollection = () => {},
}) {
  return (
    <>
      {isOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        id="dashboard-sidebar"
        data-state={isOpen ? 'open' : 'closed'}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-3rem))] -translate-x-full flex-col overflow-hidden bg-white opacity-0 transition-[transform,opacity] duration-200 lg:sticky lg:top-0 lg:z-0 lg:h-dvh lg:w-[288px] lg:translate-x-0 lg:opacity-100 lg:duration-0',
          isOpen && 'translate-x-0 opacity-100',
        )}
      >
        <WrangleSidebar
          activeItem={activeItem}
          onCreateCollection={onCreateCollection}
          onNavigate={(label) => {
            onNavigate(label)
            onClose()
          }}
        />
      </aside>
    </>
  )
}
