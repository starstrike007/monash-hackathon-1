import { useEffect, useRef, useState } from 'react'
import { CaretLeft, CaretRight, DownloadSimple, FileX, Spinner } from '@phosphor-icons/react'

import { attachmentPageImageUrl, attachmentUrl, getAttachmentView } from '@/lib/api'
import { cn } from '@/lib/utils'

const HIGHLIGHT = 'bg-[#FBEBCF] ring-1 ring-inset ring-[#C47A00]'

function ViewerShell({ label, path, children }) {
  const filename = path ? path.split('/').pop() : ''
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[#E4DFD1] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[#E4DFD1] bg-[#FBF9F4] px-3 py-2">
        <div className="min-w-0">
          {label && (
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#8A7F68]">
              {label}
            </p>
          )}
          <p className="truncate font-mono text-xs text-[#16232B]" title={filename}>
            {filename}
          </p>
        </div>
        {path && (
          <a
            href={attachmentUrl(path)}
            download
            className="flex shrink-0 items-center gap-1 rounded border border-[#0E5A66] px-2 py-1 text-xs font-medium text-[#0E5A66] hover:bg-[#0E5A66] hover:text-white"
          >
            <DownloadSimple size={14} weight="bold" />
            Download original
          </a>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </div>
  )
}

function TxtView({ view, location, highlightRef }) {
  return (
    <pre className="font-mono text-xs leading-5">
      {view.lines.map((line, index) => {
        const lineNumber = index + 1
        const isHighlighted = location?.line === lineNumber
        return (
          <div
            key={index}
            ref={isHighlighted ? highlightRef : undefined}
            className={cn('whitespace-pre-wrap rounded px-2 py-0.5', isHighlighted && HIGHLIGHT)}
          >
            <span className="mr-3 select-none text-[#B8AF9C]">
              {String(lineNumber).padStart(3, ' ')}
            </span>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

function PdfView({ view, path, location, page, onPageChange, highlightRef }) {
  const pageCount = view.page_count || 1
  const bbox = location?.page === page ? location.bbox : null
  const quotedText = location?.page === page && !bbox ? location.quoted_text : null

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3 text-xs text-[#26353D]">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="rounded border border-[#E4DFD1] p-1 disabled:opacity-30"
        >
          <CaretLeft size={14} />
        </button>
        <span className="font-mono">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          className="rounded border border-[#E4DFD1] p-1 disabled:opacity-30"
        >
          <CaretRight size={14} />
        </button>
      </div>
      <div
        className="relative inline-block overflow-hidden rounded border border-[#E4DFD1]"
        ref={bbox ? highlightRef : undefined}
      >
        <img
          src={attachmentPageImageUrl(path, page)}
          alt={`Page ${page}`}
          className="block max-w-full"
        />
        {bbox && (
          <div
            className="absolute border-2 border-[#C47A00] bg-[#FBEBCF]/50"
            style={{
              left: `${bbox.x0 * 100}%`,
              top: `${bbox.top * 100}%`,
              width: `${Math.max(bbox.x1 - bbox.x0, 0.01) * 100}%`,
              height: `${Math.max(bbox.bottom - bbox.top, 0.01) * 100}%`,
            }}
          />
        )}
      </div>
      {quotedText && (
        <div
          ref={highlightRef}
          className="max-w-md rounded border border-[#C47A00] bg-[#FBEBCF] p-2 text-xs text-[#8A5300]"
        >
          <p className="font-medium">Quoted text (reading has no precise page position)</p>
          <p className="mt-1 font-mono">&ldquo;{quotedText}&rdquo;</p>
        </div>
      )}
    </div>
  )
}

function XlsxView({ view, location, highlightRef }) {
  return (
    <div className="space-y-4">
      {view.sheets.map((sheet) => {
        const isTargetSheet = sheet.name === location?.sheet
        return (
          <div key={sheet.name}>
            <p className="mb-1 text-xs font-medium text-[#26353D]">{sheet.name}</p>
            <div className="overflow-auto rounded border border-[#E4DFD1]">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border-b border-r border-[#E4DFD1] bg-[#F6F3EC] px-2 py-1" />
                    {sheet.column_letters.map((letter) => (
                      <th
                        key={letter}
                        className="border-b border-r border-[#E4DFD1] bg-[#F6F3EC] px-2 py-1 font-mono text-[#8A7F68]"
                      >
                        {letter}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((row, rowIndex) => {
                    const rowNumber = rowIndex + 1
                    return (
                      <tr key={rowIndex}>
                        <td className="border-b border-r border-[#E4DFD1] bg-[#F6F3EC] px-2 py-1 font-mono text-[#B8AF9C]">
                          {rowNumber}
                        </td>
                        {row.map((cellValue, colIndex) => {
                          const cellRef = `${sheet.column_letters[colIndex]}${rowNumber}`
                          const isHighlighted = isTargetSheet && cellRef === location?.cell
                          return (
                            <td
                              key={colIndex}
                              ref={isHighlighted ? highlightRef : undefined}
                              className={cn(
                                'whitespace-nowrap border-b border-r border-[#E4DFD1] px-2 py-1',
                                isHighlighted && HIGHLIGHT,
                              )}
                            >
                              {cellValue}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DocxView({ view, location, highlightRef }) {
  return (
    <div className="space-y-4">
      <span className="inline-block rounded bg-[#F6F3EC] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8A7F68]">
        Extracted view
      </span>
      <div className="space-y-1">
        {view.paragraphs.map((paragraph) => {
          const isHighlighted = location?.paragraph_index === paragraph.paragraph_index
          return (
            <p
              key={paragraph.paragraph_index}
              ref={isHighlighted ? highlightRef : undefined}
              className={cn('rounded px-2 py-1 text-sm text-[#16232B]', isHighlighted && HIGHLIGHT)}
            >
              {paragraph.text}
            </p>
          )
        })}
      </div>
      {view.tables.map((table, tableIndex) => (
        <div key={tableIndex} className="overflow-auto rounded border border-[#E4DFD1]">
          <table className="min-w-full border-collapse text-xs">
            <tbody>
              {table.map((row, rowIndex) => {
                const isHighlighted =
                  location?.table_index === tableIndex && location?.row_index === rowIndex
                return (
                  <tr
                    key={rowIndex}
                    ref={isHighlighted ? highlightRef : undefined}
                    className={cn(isHighlighted && HIGHLIGHT)}
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border-b border-r border-[#E4DFD1] px-2 py-1 align-top"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

/**
 * Renders an SI/BL attachment (txt/pdf/xlsx/docx) with the value that
 * produced a field scrolled into view and highlighted, using the field's
 * `location` evidence (page/line/sheet/cell/table_index/row_index/bbox).
 * PDFs are rendered as server-side page images (pypdfium2) rather than
 * pdf.js, so scanned and text PDFs use one code path with no fabricated
 * bounding boxes for vision-only evidence.
 */
export function DocumentViewer({ path, label, location, className }) {
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [page, setPage] = useState(location?.page || 1)
  const highlightRef = useRef(null)

  useEffect(() => {
    if (!path) {
      setView(null)
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getAttachmentView(path)
      .then((data) => {
        if (cancelled) return
        setView(data)
        setPage(location?.page || 1)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load this document')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  useEffect(() => {
    if (location?.page) setPage(location.page)
  }, [location?.page])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [view, page, location])

  return (
    <ViewerShell label={label} path={path}>
      {!path && (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm text-[#8A7F68]">
          <FileX size={28} />
          <p>No document selected</p>
        </div>
      )}
      {path && loading && (
        <div className="flex h-full items-center justify-center gap-2 py-10 text-sm text-[#8A7F68]">
          <Spinner className="animate-spin" size={16} />
          Loading document…
        </div>
      )}
      {path && !loading && error && (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm text-[#A32720]">
          <FileX size={28} />
          <p>{error}</p>
        </div>
      )}
      {path && !loading && !error && view?.type === 'txt' && (
        <TxtView view={view} location={location} highlightRef={highlightRef} />
      )}
      {path && !loading && !error && view?.type === 'pdf' && (
        <PdfView
          view={view}
          path={path}
          location={location}
          page={page}
          onPageChange={setPage}
          highlightRef={highlightRef}
        />
      )}
      {path && !loading && !error && view?.type === 'xlsx' && (
        <XlsxView view={view} location={location} highlightRef={highlightRef} />
      )}
      {path && !loading && !error && view?.type === 'docx' && (
        <DocxView view={view} location={location} highlightRef={highlightRef} />
      )}
    </ViewerShell>
  )
}
