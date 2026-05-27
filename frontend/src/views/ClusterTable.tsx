import { useEffect, useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

import { fetchSessions } from '../api/client'
import type { Cluster, Session } from '../types'
import { useSelectionStore } from '../store/selection'

type ClusterTableProps = {
  clusters: Cluster[]
  isLoading: boolean
}

export function ClusterTable(props: ClusterTableProps) {
  const selectedCluster = useSelectionStore((s) => s.selectedCluster)

  const sessionsQ = useQuery({
    queryKey: ['sessions', selectedCluster],
    queryFn: () =>
      selectedCluster == null ? Promise.resolve([]) : fetchSessions(selectedCluster),
    // enabled flag pattern: don't fetch sessions until a cluster is selected —
    // avoids a useless API call and keeps the network tab less embarrassing
    enabled: selectedCluster != null,
    staleTime: 30_000,
  })

  const sessions = (sessionsQ.data ?? []) as Session[]

  const cols = useMemo<ColumnDef<Session>[]>(
    () => [
      {
        header: 'block_id',
        accessorKey: 'block_id',
        cell: (ctx) => (
          <span className="font-mono text-slate-700 text-sm">
            {String(ctx.getValue<string>()).slice(0, 16)}
          </span>
        ),
      },
      {
        header: 'event_sequence',
        accessorFn: (r) => r.event_sequence,
        cell: (ctx) =>
          (ctx.getValue<string[]>() ?? [])
            .slice(0, 5)
            .join(' → '),
      },
      {
        id: 'final_score',
        header: 'final_score',
        accessorFn: (r) => r.final_score,
        cell: (ctx) => {
          const v = Number(ctx.getValue<number>() ?? 0)
          const cls =
            v > 0.8
              ? 'bg-red-100 text-red-700'
              : v >= 0.5
                ? 'bg-orange-100 text-orange-700'
                : 'bg-yellow-100 text-yellow-700'
          return (
            <span className={`inline-flex items-center rounded px-2 py-0.5 tabular-nums ${cls}`}>
              {v.toFixed(3)}
            </span>
          )
        },
        sortingFn: 'basic',
      },
    ],
    []
  )

  const table = useReactTable({
    data: sessions,
    columns: cols,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ id: 'final_score', desc: true }],
    },
  })

  const parentRef = useMemo(() => ({ current: null as HTMLDivElement | null }), [])
  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 10,
  })

  if (selectedCluster == null) {
    return (
      <div className="h-full w-full rounded-lg border border-slate-300 border-dashed bg-white shadow-sm flex items-center justify-center text-slate-400">
        ← Select a cluster on the scatter plot
      </div>
    )
  }

  return (
    <div className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <div className="text-slate-500 text-xs uppercase tracking-wider">
          Sessions — cluster {selectedCluster} selected
        </div>
        <div className="text-xs text-slate-500">{sessions.length} sessions in cluster {selectedCluster}</div>
      </div>

      <div className="p-3 min-h-0 flex-1 overflow-auto" ref={parentRef as any}>
        {props.isLoading || sessionsQ.isLoading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : null}
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="text-left px-3 py-2 font-medium text-slate-500 text-xs uppercase">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' } as any}>
            {rowVirtualizer.getVirtualItems().map((vRow) => {
              const row = table.getRowModel().rows[vRow.index]
              if (!row) return null
              return (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 hover:bg-slate-50"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 text-slate-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

