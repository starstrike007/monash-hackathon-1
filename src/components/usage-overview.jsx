import { ArrowRight, Info, Plus } from '@phosphor-icons/react'

const metrics = [
  { label: 'Requests', value: '307.12k' },
  { label: 'CPU time', value: '226,327 ms' },
  { label: 'Observability events', value: '407.7k' },
  { label: 'Workers build mins', value: '0' },
]

const subtleColor = 'oklch(55.6% 0 0)'
const defaultColor = 'oklch(20.5% 0 0)'

function InfoIcon({ className = '' }) {
  return <Info className={className} size={16} weight="regular" aria-hidden="true" />
}

function MetricCard({ label, value, onSelect }) {
  return (
    <button
      type="button"
      className="h-[86px] w-[162px] bg-transparent px-0 py-px text-left text-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(15%_0_0)]/50"
      style={{ color: 'rgb(0, 0, 0)', borderColor: 'rgb(0, 0, 0)' }}
      onClick={() => onSelect(`${label}: ${value}`)}
      aria-label={`${label}: ${value}`}
    >
      <div className="relative h-[84px] w-[162px] overflow-hidden rounded-lg bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[oklch(14.5%_0_0_/_10%)] transition-colors hover:bg-[oklch(98%_0_0)]">
        <div
          className="mb-1 flex h-4 w-full min-w-0 items-center gap-1 overflow-hidden truncate text-xs leading-4"
          style={{ color: subtleColor }}
        >
          <span className="shrink-0 truncate">{label}</span>
          <InfoIcon />
        </div>
        <div className="h-8 w-full overflow-hidden">
          <div
            className="origin-left"
            style={{ transform: 'scale(1)', transformOrigin: 'left center', display: 'inline-block' }}
          >
            <div className="inline-block whitespace-nowrap text-2xl font-semibold leading-8 text-[oklch(14.5%_0_0)]">
              {value}
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

export function UsageOverview({ onAction = () => {} }) {
  return (
    <section
      className="flex h-[492.289px] w-[336px] flex-col gap-4 text-[oklch(19.2%_0_0)] transition-all"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', lineHeight: '24px', letterSpacing: '-0.16px' }}
      aria-labelledby="usage-overview-title"
    >
      <div className="flex h-9 w-[336px] items-center justify-between">
        <h2 id="usage-overview-title" className="m-0 text-2xl font-semibold leading-8 text-[oklch(19.2%_0_0)]">
          Usage
        </h2>
      </div>

      <div className="flex h-[209px] w-[336px] flex-col overflow-hidden rounded-lg bg-[oklch(98%_0_0)] text-sm leading-[21px] ring-1 ring-[oklch(93.5%_0_0)]">
        <div className="-my-2 flex h-[53px] w-[336px] items-center justify-between gap-3 bg-[oklch(98%_0_0)] p-4 font-medium" style={{ color: subtleColor }}>
          <a
            href="/b2ee524439a8ef367969ccf814698038/billing/billable-usage"
            className="flex h-[21px] min-w-0 flex-1 items-center justify-between gap-2 no-underline transition-[color] duration-150 ease-in hover:text-[oklch(15%_0_0)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(15%_0_0)]/50"
            style={{ color: defaultColor, borderColor: defaultColor }}
          >
            <span className="h-[21px] min-w-0 truncate text-base font-medium" style={{ color: subtleColor }}>
              Billing Dashboard
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" size={16} weight="regular" style={{ color: subtleColor }} aria-hidden="true" />
          </a>
        </div>

        <div className="relative flex h-[172px] w-[336px] flex-col gap-3 overflow-hidden rounded-lg bg-white p-4 text-inherit ring-1 ring-[oklch(92.2%_0_0)]">
          <div className="flex h-8 w-[304px] items-center justify-between gap-3">
            <div className="flex h-8 w-[161.688px] items-center gap-1 text-xs leading-4" style={{ color: subtleColor }}>
              <span className="h-8 w-[143.844px]">
                Billable usage (current period)
              </span>
              <InfoIcon className="h-4 w-[13.844px] shrink-0" />
            </div>
            <button
              type="button"
              className="group flex h-[26px] w-[130.312px] shrink-0 items-center justify-center gap-1 rounded-md border-0 px-2 py-px text-center text-xs font-medium leading-[18px] tracking-[-0.12px] text-[oklch(20.5%_0_0)] shadow-none transition-colors hover:bg-[oklch(97%_0_0)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(15%_0_0)]/50"
              style={{ color: defaultColor, borderColor: defaultColor }}
              onClick={() => onAction('Budget alert setup is ready to connect.')}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" size={14} weight="regular" aria-hidden="true" />
              <span>Add Budget Alert</span>
            </button>
          </div>

          <div className="flex h-24 w-[304px] min-w-0 items-center gap-4">
            <div className="relative h-24 w-24 shrink-0">
              <svg className="h-24 w-24 overflow-hidden" viewBox="0 0 96 96" width="96" height="96" role="img" aria-label="$0.00">
                <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" style={{ color: 'oklch(14.5% 0 0 / 10%)' }} />
              </svg>
              <div className="pointer-events-none absolute inset-0 flex h-24 w-24 items-center justify-center">
                <span className="text-[13px] font-semibold leading-[19.5px]" style={{ color: subtleColor }}>
                  $0.00
                </span>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-center">
              <span className="whitespace-nowrap text-[13px] leading-[15.2941px]" style={{ color: subtleColor }}>
                No billable usage incurred yet
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-[15.289px] w-[336px] text-[13px] font-medium leading-[15.2941px]" style={{ color: subtleColor }}>
        August 21 - September 21
      </div>

      <div className="flex h-[184px] w-[336px] flex-col gap-5">
        <div className="grid h-[184px] w-[336px] grid-cols-2 gap-3">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} onSelect={onAction} />
          ))}
        </div>
      </div>
    </section>
  )
}
