import { useState } from 'react'
import {
  Bell,
  CaretDown,
  DotsThree,
  DownloadSimple,
  List,
  MagnifyingGlass,
  Plus,
  Target,
} from '@phosphor-icons/react'

import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { UsageMetricCard, UsageOverview } from '@/components/usage-overview'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const activityData = [
  { day: 'Mon', value: 42 },
  { day: 'Tue', value: 58 },
  { day: 'Wed', value: 47 },
  { day: 'Thu', value: 72 },
  { day: 'Fri', value: 64 },
  { day: 'Sat', value: 35 },
  { day: 'Sun', value: 52 },
]

const stats = [
  { label: 'Active projects', value: '12', change: '+8.2%' },
  { label: 'Team members', value: '24', change: '+4.1%' },
  { label: 'Tasks completed', value: '184', change: '+12.5%' },
  { label: 'On track', value: '92.4%', change: '+3.8%' },
]

const activity = [
  {
    initials: 'JL',
    name: 'Jordan Lee',
    action: 'completed the research brief',
    time: '12 min ago',
    color: 'bg-orange-100 text-orange-700',
  },
  {
    initials: 'PS',
    name: 'Priya Shah',
    action: 'created a new project',
    time: '45 min ago',
    color: 'bg-orange-100 text-orange-700',
  },
  {
    initials: 'MC',
    name: 'Marcus Chen',
    action: 'commented on the launch plan',
    time: '2 hours ago',
    color: 'bg-emerald-100 text-emerald-700',
  },
  {
    initials: 'AM',
    name: 'Alex Morgan',
    action: 'updated the team goals',
    time: 'Yesterday',
    color: 'bg-[#FFF1E6] text-[#FD6100]',
  },
]

const projects = [
  {
    name: 'Customer discovery',
    owner: 'Jordan Lee',
    progress: 78,
    status: 'On track',
    color: 'bg-emerald-500',
  },
  {
    name: 'Launch planning',
    owner: 'Priya Shah',
    progress: 54,
    status: 'In progress',
    color: 'bg-[#FD6100]',
  },
  {
    name: 'Brand refresh',
    owner: 'Marcus Chen',
    progress: 32,
    status: 'Needs attention',
    color: 'bg-amber-500',
  },
]

function StatCard({ label, value, change, onSelect }) {
  return (
    <UsageMetricCard
      label={label}
      value={value}
      secondaryText={change}
      onSelect={() => onSelect(`${label}: ${value} (${change} vs. last month)`)}
      ariaLabel={`${label}: ${value}, ${change} vs. last month`}
    />
  )
}

export function Dashboard() {
  const [activeItem, setActiveItem] = useState('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState('')

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  return (
    <div className="min-h-dvh bg-[#FCFCFC] text-[#4A4A4A]">
      <div className="flex min-h-dvh">
        <DashboardSidebar
          activeItem={activeItem}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNavigate={setActiveItem}
          onSearch={() => showNotice('Search is ready for your workspace data.')}
        />

        <main className="min-w-0 flex-1">
          <header className="h-16 shrink-0 border-b border-neutral-200/80 bg-neutral-100/70 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
            <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 text-[#7B7B7B] lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open navigation"
                >
                  <List className="h-5 w-5" weight="regular" aria-hidden="true" />
                </Button>
                <div className="min-w-0">
                  <h1 className="truncate text-[15px] font-semibold leading-snug text-neutral-900">
                    {activeItem}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-[#7B7B7B]"
                  aria-label="Search"
                  onClick={() => showNotice('Search is ready for your workspace data.')}
                >
                  <MagnifyingGlass className="h-4 w-4" weight="regular" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative text-[#7B7B7B]"
                  aria-label="Notifications"
                  onClick={() => showNotice('You are all caught up.')}
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#FD6100]" />
                </Button>
                <Separator
                  orientation="vertical"
                  className="mx-1 hidden h-6 bg-[#EEEEEE] sm:block"
                />
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[#FFF1E6] text-[#FD6100]">AM</AvatarFallback>
                </Avatar>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-[#FD6100]">Friday, September 18, 2026</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#4A4A4A] sm:text-3xl">
                  Good morning, Alex
                </h2>
                <p className="mt-2 text-sm text-[#7B7B7B]">
                  Here’s what’s happening across your workspace.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="date-range">
                  Date range
                </label>
                <div className="relative">
                  <select
                    id="date-range"
                    className="h-10 appearance-none rounded-lg border border-[#F0F0F0] bg-white py-2 pl-3 pr-9 text-sm font-medium text-[#4A4A4A] outline-none focus:border-[#FD6100] focus:ring-2 focus:ring-[#FD6100]/20"
                  >
                    <option>Last 30 days</option>
                    <option>Last 7 days</option>
                    <option>This quarter</option>
                  </select>
                  <CaretDown
                    className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[#A3A3A3]"
                    weight="regular"
                    aria-hidden="true"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => showNotice('Your report is being prepared.')}
                >
                  <DownloadSimple className="mr-2 h-4 w-4" weight="regular" aria-hidden="true" />
                  Export
                </Button>
                <Button onClick={() => showNotice('New project flow is ready to connect.')}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  New project
                </Button>
              </div>
            </section>

            <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
              <section
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                aria-label="Workspace summary"
              >
                {stats.map((stat) => (
                  <StatCard key={stat.label} {...stat} onSelect={showNotice} />
                ))}
              </section>

              <aside
                className="sticky top-20 hidden h-fit w-[400px] p-8 xl:block"
                aria-label="Usage summary"
              >
                <UsageOverview onAction={showNotice} />
              </aside>
            </div>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Activity overview</CardTitle>
                    <CardDescription className="mt-1">
                      Completed tasks over the past week
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-2 -mt-2"
                    aria-label="More activity options"
                    onClick={() => showNotice('Activity options are coming soon.')}
                  >
                    <DotsThree className="h-5 w-5" weight="bold" aria-hidden="true" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex h-56 items-end gap-2 border-b border-l border-[#EEEEEE] px-3 pb-0 pt-6 sm:gap-4 sm:px-5">
                    {activityData.map((item) => (
                      <div
                        className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                        key={item.day}
                      >
                        <div className="group relative flex h-full w-full cursor-pointer items-end justify-center">
                          <div
                            className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 translate-y-1 rounded bg-[#4A4A4A] px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-md transition-all duration-200 group-hover:-translate-y-1 group-hover:opacity-100"
                            style={{ bottom: `calc(${item.value}% + 6px)` }}
                          >
                            {item.value}
                          </div>
                          <div
                            className="w-full max-w-10 origin-bottom rounded-t-md bg-[#FFF1E6] transition-all duration-200 ease-out group-hover:max-w-14 group-hover:scale-y-[1.08] group-hover:bg-[#FD6100] group-hover:shadow-lg group-hover:shadow-[#FD6100]/30 motion-reduce:transition-none"
                            style={{ height: `${item.value}%` }}
                          />
                        </div>
                        <span className="mb-3 text-xs text-[#A3A3A3]">{item.day}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-5 text-xs text-[#7B7B7B]">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#FD6100]" />
                      Completed
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#F0F0F0]" />
                      Remaining capacity
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Team goals</CardTitle>
                    <CardDescription className="mt-1">
                      Progress toward this quarter’s goals
                    </CardDescription>
                  </div>
                  <Target className="h-5 w-5 text-[#FD6100]" weight="regular" aria-hidden="true" />
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-[#4A4A4A]">Launch readiness</span>
                      <span className="text-[#7B7B7B]">76%</span>
                    </div>
                    <Progress value={76} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-[#4A4A4A]">Customer interviews</span>
                      <span className="text-[#7B7B7B]">64%</span>
                    </div>
                    <Progress value={64} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-[#4A4A4A]">Documentation</span>
                      <span className="text-[#7B7B7B]">48%</span>
                    </div>
                    <Progress value={48} />
                  </div>
                  <Button
                    variant="outline"
                    className="mt-1 w-full"
                    onClick={() => showNotice('Goal management is ready to connect.')}
                  >
                    View goals
                  </Button>
                </CardContent>
              </Card>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle>Recent projects</CardTitle>
                    <CardDescription className="mt-1">
                      A quick look at work in progress
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveItem('Projects')}>
                    View all
                  </Button>
                </CardHeader>
                <CardContent className="px-0 pb-1">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-y border-[#EEEEEE] bg-[#FCFCFC] text-xs font-medium text-[#7B7B7B]">
                        <tr>
                          <th className="px-5 py-3 font-medium">Project</th>
                          <th className="px-5 py-3 font-medium">Owner</th>
                          <th className="px-5 py-3 font-medium">Progress</th>
                          <th className="px-5 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projects.map((project) => (
                          <tr
                            className="border-b border-[#EEEEEE] last:border-0"
                            key={project.name}
                          >
                            <td className="px-5 py-4 font-medium text-[#4A4A4A]">{project.name}</td>
                            <td className="px-5 py-4 text-[#7B7B7B]">{project.owner}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <Progress value={project.progress} className="h-1.5 w-20" />
                                <span className="text-xs text-[#7B7B7B]">{project.progress}%</span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <Badge
                                variant={
                                  project.status === 'Needs attention' ? 'warning' : 'success'
                                }
                              >
                                <span
                                  className={cn('mr-1.5 h-1.5 w-1.5 rounded-full', project.color)}
                                />
                                {project.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle>Recent activity</CardTitle>
                    <CardDescription className="mt-1">
                      Latest updates from your team
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => showNotice('Showing the latest updates.')}
                  >
                    View all
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activity.map((item) => (
                    <div className="flex items-start gap-3" key={`${item.name}-${item.time}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={cn('text-[10px]', item.color)}>
                          {item.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 text-sm leading-5">
                        <p className="text-[#4A4A4A]">
                          <span className="font-medium text-neutral-900">{item.name}</span>{' '}
                          {item.action}
                        </p>
                        <p className="mt-0.5 text-xs text-[#A3A3A3]">{item.time}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </div>
        </main>
      </div>

      {notice && (
        <div
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#4A4A4A] px-4 py-3 text-sm font-medium text-white shadow-lg"
          role="status"
        >
          {notice}
        </div>
      )}
    </div>
  )
}
