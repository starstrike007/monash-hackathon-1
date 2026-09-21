import { formatBusinessDateTimeParts } from '@/lib/time'

/** Right-aligned received date with the time underneath, as in an email list. */
export function ReceivedAt({ value }) {
  const parts = formatBusinessDateTimeParts(value)
  return (
    <span className="flex flex-col text-xs leading-snug text-[#71808A] sm:items-end sm:text-right">
      <span className="font-medium text-[#46555E]">{parts?.date ?? '—'}</span>
      {parts && <span>{parts.time}</span>}
    </span>
  )
}
