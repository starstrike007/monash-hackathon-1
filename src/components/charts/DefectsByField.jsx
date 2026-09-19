import { FIELDS } from '@/lib/types'

export function defectRows(defects) {
  return FIELDS.map((field) => ({ ...field, value: defects?.[field.key] || 0 })).sort(
    (a, b) => b.value - a.value,
  )
}

export function defectTotal(defects) {
  return FIELDS.reduce((sum, field) => sum + (defects?.[field.key] || 0), 0)
}

export function DefectsByField({ defects, className = 'mt-6' }) {
  const rows = defectRows(defects)
  const maximum = Math.max(...rows.map((row) => row.value), 1)
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1

  return (
    <div className={`${className} space-y-4`}>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 text-[#46555E]">{row.label}</span>
          <div className="h-2 flex-1 rounded-full bg-[#E9E5D9]">
            <div
              className="h-2 rounded-full bg-[#CF3B32]"
              style={{ width: `${(row.value / maximum) * 100}%` }}
              title={`${row.value} mismatches · ${Math.round((row.value / total) * 100)}% of defects`}
            />
          </div>
          <span className="w-7 text-right font-mono text-[#46555E]">{row.value}</span>
        </div>
      ))}
    </div>
  )
}
