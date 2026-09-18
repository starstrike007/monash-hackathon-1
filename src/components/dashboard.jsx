import { useEffect, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  Download,
  FolderKanban,
  Menu,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Sun,
  Target,
  TrendingUp,
  UsersRound,
} from 'lucide-react'

import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const stats = [
  { label: 'Active projects', value: '12', change: '+8.2%', icon: FolderKanban, tone: 'indigo' },
  { label: 'Team members', value: '24', change: '+4.1%', icon: UsersRound, tone: 'sky' },
  { label: 'Tasks completed', value: '184', change: '+12.5%', icon: Check, tone: 'emerald' },
  { label: 'On track', value: '92.4%', change: '+3.8%', icon: TrendingUp, tone: 'amber' },
]

const activityData = [
  { day: 'Mon', value: 42 },
  { day: 'Tue', value: 58 },
  { day: 'Wed', value: 47 },
  { day: 'Thu', value: 72 },
  { day: 'Fri', value: 64 },
  { day: 'Sat', value: 35 },
  { day: 'Sun', value: 52 },
]

const activity = [
  { initials: 'JL', name: 'Jordan Lee', action: 'completed the research brief', time: '12 min ago', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  { initials: 'PS', name: 'Priya Shah', action: 'created a new project', time: '45 min ago', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  { initials: 'MC', name: 'Marcus Chen', action: 'commented on the launch plan', time: '2 hours ago', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  { initials: 'AM', name: 'Alex Morgan', action: 'updated the team goals', time: 'Yesterday', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
]

const projects = [
  { name: 'Customer discovery', owner: 'Jordan Lee', progress: 78, status: 'On track', color: 'bg-emerald-500' },
  { name: 'Launch planning', owner: 'Priya Shah', progress: 54, status: 'In progress', color: 'bg-indigo-500' },
  { name: 'Brand refresh', owner: 'Marcus Chen', progress: 32, status: 'Needs attention', color: 'bg-amber-500' },
]

const THEME_STORAGE_KEY = 'northstar-theme'

function getInitialDarkMode() {
  if (typeof window === 'undefined') return false

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (storedTheme === 'dark') return true
    if (storedTheme === 'light') return false
  } catch {
    // Fall back to the system preference when storage is unavailable.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function StatCard({ label, value, change, icon: Icon, tone }) {
  const toneClasses = {
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</p>
          </div>
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClasses[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-xs">
          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span className="font-medium text-emerald-600 dark:text-emerald-400">{change}</span>
          <span className="text-slate-400 dark:text-slate-500">vs. last month</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const [activeItem, setActiveItem] = useState('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [isDarkMode, setIsDarkMode] = useState(getInitialDarkMode)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light')
    } catch {
      // Theme still works for the current session when storage is unavailable.
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDarkMode ? '#020617' : '#f7f8fa')
  }, [isDarkMode])

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-50">
      <div className="flex min-h-screen">
        <DashboardSidebar
          activeItem={activeItem}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNavigate={setActiveItem}
        />

        <main className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white/90 px-4 backdrop-blur transition-colors sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-950/90">
            <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
                <div className="hidden items-center gap-2 text-sm text-slate-400 dark:text-slate-500 sm:flex">
                  <span>Workspace</span>
                  <span className="text-slate-300 dark:text-slate-700">/</span>
                </div>
                <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{activeItem}</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button variant="ghost" size="icon" className="text-slate-500 dark:text-slate-400" aria-label="Search" onClick={() => showNotice('Search is ready for your workspace data.')}>
                  <Search className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-500 dark:text-slate-400"
                  aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-pressed={isDarkMode}
                  title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                  onClick={() => setIsDarkMode((current) => !current)}
                >
                  {isDarkMode ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                </Button>
                <Button variant="ghost" size="icon" className="relative text-slate-500 dark:text-slate-400" aria-label="Notifications" onClick={() => showNotice('You are all caught up.') }>
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                </Button>
                <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">AM</AvatarFallback>
                </Avatar>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Friday, September 18, 2026</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-3xl">Good morning, Alex</h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Here’s what’s happening across your workspace.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="date-range">Date range</label>
                <div className="relative">
                <select id="date-range" className="h-10 appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-slate-500 dark:focus:ring-slate-700">
                    <option>Last 30 days</option>
                    <option>Last 7 days</option>
                    <option>This quarter</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                </div>
                <Button variant="outline" onClick={() => showNotice('Your report is being prepared.') }>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Export
                </Button>
                <Button onClick={() => showNotice('New project flow is ready to connect.') }>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  New project
                </Button>
              </div>
            </section>

            <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace summary">
              {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Activity overview</CardTitle>
                    <CardDescription className="mt-1">Completed tasks over the past week</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" className="-mr-2 -mt-2" aria-label="More activity options" onClick={() => showNotice('Activity options are coming soon.') }>
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex h-56 items-end gap-2 border-b border-l border-slate-200 px-3 pb-0 pt-6 dark:border-slate-700 sm:gap-4 sm:px-5">
                    {activityData.map((item) => (
                      <div className="flex h-full flex-1 flex-col items-center justify-end gap-2" key={item.day}>
                        <div className="group relative flex h-full w-full items-end justify-center">
                          <div className="absolute bottom-0 hidden rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white group-hover:block dark:bg-white dark:text-slate-950">{item.value}</div>
                          <div className="w-full max-w-10 rounded-t-md bg-indigo-100 transition-colors group-hover:bg-indigo-500 dark:bg-indigo-500/25 dark:group-hover:bg-indigo-400" style={{ height: `${item.value}%` }} />
                        </div>
                        <span className="mb-3 text-xs text-slate-400 dark:text-slate-500">{item.day}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-indigo-500" />Completed</span>
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700" />Remaining capacity</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Team goals</CardTitle>
                    <CardDescription className="mt-1">Progress toward this quarter’s goals</CardDescription>
                  </div>
                  <Target className="h-5 w-5 text-indigo-500" aria-hidden="true" />
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Launch readiness</span>
                      <span className="text-slate-500 dark:text-slate-400">76%</span>
                    </div>
                    <Progress value={76} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Customer interviews</span>
                      <span className="text-slate-500 dark:text-slate-400">64%</span>
                    </div>
                    <Progress value={64} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Documentation</span>
                      <span className="text-slate-500 dark:text-slate-400">48%</span>
                    </div>
                    <Progress value={48} />
                  </div>
                  <Button variant="outline" className="mt-1 w-full" onClick={() => showNotice('Goal management is ready to connect.')}>View goals</Button>
                </CardContent>
              </Card>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle>Recent projects</CardTitle>
                    <CardDescription className="mt-1">A quick look at work in progress</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveItem('Projects')}>View all</Button>
                </CardHeader>
                <CardContent className="px-0 pb-1">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-y border-slate-100 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                        <tr>
                          <th className="px-5 py-3 font-medium">Project</th>
                          <th className="px-5 py-3 font-medium">Owner</th>
                          <th className="px-5 py-3 font-medium">Progress</th>
                          <th className="px-5 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projects.map((project) => (
                          <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800" key={project.name}>
                            <td className="px-5 py-4 font-medium text-slate-800 dark:text-slate-200">{project.name}</td>
                            <td className="px-5 py-4 text-slate-500 dark:text-slate-400">{project.owner}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <Progress value={project.progress} className="h-1.5 w-20" />
                                <span className="text-xs text-slate-500 dark:text-slate-400">{project.progress}%</span>
                              </div>
                            </td>
                            <td className="px-5 py-4"><Badge variant={project.status === 'Needs attention' ? 'warning' : 'success'}><span className={cn('mr-1.5 h-1.5 w-1.5 rounded-full', project.color)} />{project.status}</Badge></td>
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
                    <CardDescription className="mt-1">Latest updates from your team</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => showNotice('Showing the latest updates.')}>View all</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activity.map((item) => (
                    <div className="flex items-start gap-3" key={`${item.name}-${item.time}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={cn('text-[10px]', item.color)}>{item.initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 text-sm leading-5">
                        <p className="text-slate-700 dark:text-slate-300"><span className="font-medium text-slate-900 dark:text-white">{item.name}</span> {item.action}</p>
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{item.time}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200 pt-5 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>Northstar workspace · Demo data</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> All systems operational</span>
            </footer>
          </div>
        </main>
      </div>

      {notice && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-950" role="status">
          {notice}
        </div>
      )}
    </div>
  )
}
