import { useState } from 'react'

import { CATEGORY_LABELS } from '@/lib/types'

// Categorical slots 1-5, fixed order. Blues and slates only: red, amber and green
// are reserved for mismatch, review and verified states. Colour follows the
// category, never its rank, so slices are drawn in this order.
const SLICES = [
  { key: 'BL_COMPARISON', color: '#0F172A' },
  { key: 'SI_REQUEST', color: '#4F46E5' },
  { key: 'INVOICE_QUERY', color: '#06B6D4' },
  { key: 'GENERAL', color: '#64748B' },
  { key: 'SPAM', color: '#94A3B8' },
]
const OTHER_COLOR = '#CBD5E1'

const SIZE = 232
const CENTER = SIZE / 2
const OUTER = 104
const INNER = 66

function polar(radius, degrees) {
  const radians = ((degrees - 90) * Math.PI) / 180
  return [CENTER + radius * Math.cos(radians), CENTER + radius * Math.sin(radians)]
}

function sectorPath(start, end) {
  const sweep = end - start
  // A full circle can't be drawn as a single arc — split it into two halves.
  if (sweep >= 359.999) {
    return `${sectorPath(start, start + 180)} ${sectorPath(start + 180, start + 359.999)}`
  }
  const large = sweep > 180 ? 1 : 0
  const [x1, y1] = polar(OUTER, start)
  const [x2, y2] = polar(OUTER, end)
  const [x3, y3] = polar(INNER, end)
  const [x4, y4] = polar(INNER, start)
  return [
    `M ${x1} ${y1}`,
    `A ${OUTER} ${OUTER} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}

function buildSlices(categories) {
  const source = { ...(categories || {}) }
  const slices = SLICES.map(({ key, color }) => {
    const value = source[key] || 0
    delete source[key]
    return { key, color, label: CATEGORY_LABELS[key] || key, value }
  }).filter((slice) => slice.value > 0)

  const otherValue = Object.values(source).reduce((sum, value) => sum + (value || 0), 0)
  if (otherValue > 0) {
    slices.push({ key: 'OTHER', color: OTHER_COLOR, label: 'Other', value: otherValue })
  }
  return slices
}

export function CategoryPie({ categories, onSelect }) {
  const [active, setActive] = useState(null)

  const slices = buildSlices(categories)
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)

  if (!total) {
    return <p className="mt-6 text-sm text-[#64748B]">No emails classified yet.</p>
  }

  let cursor = 0
  const arcs = slices.map((slice) => {
    const start = cursor
    const end = start + (slice.value / total) * 360
    cursor = end
    return { ...slice, start, end, share: Math.round((slice.value / total) * 100) }
  })

  const focused = arcs.find((arc) => arc.key === active)

  return (
    <div className="mt-6 flex flex-col items-center gap-6">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="shrink-0"
        role="img"
        aria-label={`Inbox by category: ${arcs.map((arc) => `${arc.label} ${arc.value}`).join(', ')}`}
        onMouseLeave={() => setActive(null)}
      >
        {arcs.map((arc) => (
          <path
            key={arc.key}
            d={sectorPath(arc.start, arc.end)}
            fill={arc.color}
            stroke="#FFFFFF"
            strokeWidth="2"
            opacity={!focused || focused.key === arc.key ? 1 : 0.32}
            className="cursor-pointer transition-opacity"
            onClick={() => arc.key !== 'OTHER' && onSelect?.(arc.key)}
            onMouseEnter={() => setActive(arc.key)}
            onFocus={() => setActive(arc.key)}
            tabIndex={0}
          >
            <title>{`${arc.label}: ${arc.value} emails (${arc.share}%)`}</title>
          </path>
        ))}
        <text
          x={CENTER}
          y={focused ? CENTER - 8 : CENTER - 4}
          textAnchor="middle"
          className="fill-[#0F172A] font-mono text-[28px] font-semibold"
        >
          {focused ? focused.value : total}
        </text>
        <text
          x={CENTER}
          y={focused ? CENTER + 14 : CENTER + 18}
          textAnchor="middle"
          className="fill-[#64748B] text-[12px] font-medium"
        >
          {focused ? `${focused.share}% of inbox` : 'emails'}
        </text>
        {focused && (
          <text
            x={CENTER}
            y={CENTER + 30}
            textAnchor="middle"
            className="fill-[#475569] text-[11px] font-semibold"
          >
            {focused.label}
          </text>
        )}
      </svg>

      <ul className="w-full min-w-0 space-y-1">
        {arcs.map((arc) => (
          <li key={arc.key}>
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                focused?.key === arc.key ? 'bg-[#F1F5F9]' : 'hover:bg-[#F8FAFC]'
              }`}
              onClick={() => arc.key !== 'OTHER' && onSelect?.(arc.key)}
              title={arc.key === 'OTHER' ? undefined : `Show ${arc.label} in the inbox`}
              onMouseEnter={() => setActive(arc.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(arc.key)}
              onBlur={() => setActive(null)}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm bg-current"
                style={{ color: arc.color }}
              />
              <span className="min-w-0 flex-1 whitespace-nowrap font-medium text-[#1E293B]">
                {arc.label}
              </span>
              <span className="font-mono text-[#1E293B]">{arc.value}</span>
              <span className="w-10 text-right font-mono text-xs text-[#64748B]">{arc.share}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
