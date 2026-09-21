import { useEffect, useMemo, useState } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import { getDashboard } from '@/lib/api'
import { CaseDetailPage } from '@/features/case-detail/CaseDetailPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { InboxPage } from '@/features/inbox/InboxPage'
import { DocsComparisonDetailPage } from '@/features/docs-comparison/DocsComparisonDetailPage'
import { DocsComparisonListPage } from '@/features/docs-comparison/DocsComparisonListPage'

function currentLocation() {
  const url = new URL(window.location.href)
  return { pathname: url.pathname, search: url.searchParams }
}

function routeFor(location) {
  const { pathname, search } = location
  if (pathname === '/') return { name: 'dashboard', pathname: '/dashboard', search }
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'dashboard') return { name: 'dashboard', pathname, search }
  if (parts[0] === 'inbox' && parts[1])
    return { name: 'case', emailId: parts[1], mode: 'inbox', pathname, search }
  if (parts[0] === 'inbox') return { name: 'inbox', pathname, search }
  if (parts[0] === 'docs-comparison' && parts[1])
    return { name: 'docs-comparison-detail', emailId: parts[1], pathname, search }
  if (parts[0] === 'docs-comparison') return { name: 'docs-comparison', pathname, search }
  if (parts[0] === 'review' && parts[1])
    return { name: 'case', emailId: parts[1], mode: 'review', pathname, search }
  if (parts[0] === 'review')
    return {
      name: 'inbox',
      pathname: '/review',
      search: new URLSearchParams('status=needs_review'),
    }
  return { name: 'not-found', pathname, search }
}

export function Router() {
  const [location, setLocation] = useState(currentLocation)
  const [reviewCount, setReviewCount] = useState(14)
  const route = useMemo(() => routeFor(location), [location])

  useEffect(() => {
    const onPopState = () => setLocation(currentLocation())
    window.addEventListener('popstate', onPopState)
    if (location.pathname === '/') navigate('/dashboard', true)
    getDashboard()
      .then((data) => setReviewCount(data.needs_review || 0))
      .catch(() => {})
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(path, replace = false) {
    const url = new URL(path, window.location.origin)
    if (replace) window.history.replaceState({}, '', url)
    else window.history.pushState({}, '', url)
    setLocation(currentLocation())
  }

  let content
  if (route.name === 'dashboard')
    content = <DashboardPage navigate={navigate} initialRunId={route.search.get('runId')} />
  else if (route.name === 'inbox')
    content = (
      <InboxPage
        navigate={navigate}
        initialStatus={route.search.get('status')}
        from={route.search.get('from')}
      />
    )
  else if (route.name === 'case')
    content = <CaseDetailPage navigate={navigate} emailId={route.emailId} mode={route.mode} />
  else if (route.name === 'docs-comparison')
    content = (
      <DocsComparisonListPage navigate={navigate} initialStatus={route.search.get('status')} />
    )
  else if (route.name === 'docs-comparison-detail')
    content = <DocsComparisonDetailPage navigate={navigate} emailId={route.emailId} />
  else
    content = (
      <div className="p-12">
        <h1 className="font-serif text-4xl">Page not found</h1>
        <button
          className="mt-5 inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 bg-[#0E5A66] text-white hover:bg-[#0B4B55] disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none"
          onClick={() => navigate('/dashboard')}
        >
          Back to dashboard
        </button>
      </div>
    )

  return (
    <AppShell pathname={route.pathname} navigate={navigate} reviewCount={reviewCount}>
      {content}
    </AppShell>
  )
}
