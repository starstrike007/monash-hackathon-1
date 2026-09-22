import { lazy, Suspense, useEffect, useMemo, useState } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import { LoadingBoat } from '@/components/LoadingBoat'
import { getReviewCount } from '@/lib/api'

const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
)
const InboxDetailPage = lazy(() =>
  import('@/features/inbox/InboxDetailPage').then((module) => ({
    default: module.InboxDetailPage,
  })),
)
const InboxPage = lazy(() =>
  import('@/features/inbox/InboxPage').then((module) => ({ default: module.InboxPage })),
)
const DocsComparisonDetailPage = lazy(() =>
  import('@/features/docs-comparison/DocsComparisonDetailPage').then((module) => ({
    default: module.DocsComparisonDetailPage,
  })),
)
const DocsComparisonListPage = lazy(() =>
  import('@/features/docs-comparison/DocsComparisonListPage').then((module) => ({
    default: module.DocsComparisonListPage,
  })),
)
const ReviewItemDetailPage = lazy(() =>
  import('@/features/review-queue/ReviewItemDetailPage').then((module) => ({
    default: module.ReviewItemDetailPage,
  })),
)
const ReviewQueuePage = lazy(() =>
  import('@/features/review-queue/ReviewQueuePage').then((module) => ({
    default: module.ReviewQueuePage,
  })),
)

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
    return { name: 'inbox-detail', emailId: parts[1], pathname, search }
  if (parts[0] === 'inbox') return { name: 'inbox', pathname, search }
  if (parts[0] === 'docs-comparison' && parts[1])
    return { name: 'docs-comparison-detail', emailId: parts[1], pathname, search }
  if (parts[0] === 'docs-comparison') return { name: 'docs-comparison', pathname, search }
  if (parts[0] === 'review' && parts[1])
    return { name: 'review-item', itemId: parts[1], pathname, search }
  if (parts[0] === 'review') return { name: 'review-queue', pathname, search }
  return { name: 'not-found', pathname, search }
}

export function Router() {
  const [location, setLocation] = useState(currentLocation)
  const [reviewCount, setReviewCount] = useState(null)
  const route = useMemo(() => routeFor(location), [location])

  useEffect(() => {
    const onPopState = () => setLocation(currentLocation())
    window.addEventListener('popstate', onPopState)
    if (location.pathname === '/') navigate('/dashboard', true)
    let active = true
    const refreshReviewCount = () =>
      getReviewCount()
        .then((data) => {
          if (active) setReviewCount(data.count ?? 0)
        })
        .catch(() => {
          if (active) setReviewCount(null)
        })
    refreshReviewCount()
    window.addEventListener('clearance:data-changed', refreshReviewCount)
    return () => {
      active = false
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('clearance:data-changed', refreshReviewCount)
    }
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
    content = <InboxPage navigate={navigate} initialCategory={route.search.get('category')} />
  else if (route.name === 'inbox-detail')
    content = <InboxDetailPage navigate={navigate} emailId={route.emailId} />
  else if (route.name === 'docs-comparison')
    content = (
      <DocsComparisonListPage navigate={navigate} initialStatus={route.search.get('status')} />
    )
  else if (route.name === 'docs-comparison-detail')
    content = <DocsComparisonDetailPage navigate={navigate} emailId={route.emailId} />
  else if (route.name === 'review-queue')
    content = <ReviewQueuePage navigate={navigate} initialReason={route.search.get('reason')} />
  else if (route.name === 'review-item')
    content = <ReviewItemDetailPage navigate={navigate} itemId={route.itemId} />
  else
    content = (
      <div className="p-12">
        <h1 className="font-display text-[2rem] text-[#0F172A]">Page not found</h1>
        <button
          className="mt-5 inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 bg-[#0F172A] text-white hover:bg-[#1E293B] disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none"
          onClick={() => navigate('/dashboard')}
        >
          Back to dashboard
        </button>
      </div>
    )

  return (
    <AppShell pathname={route.pathname} navigate={navigate} reviewCount={reviewCount}>
      <Suspense
        fallback={
          <div className="mx-auto max-w-[900px] px-5 py-10 lg:px-14">
            <LoadingBoat label="Loading page" compact />
          </div>
        }
      >
        {content}
      </Suspense>
    </AppShell>
  )
}
