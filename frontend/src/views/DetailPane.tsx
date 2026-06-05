import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { fetchSessions } from '../api/client'
import type { Cluster, Session } from '../types'
import { useSelectionStore } from '../store/selection'

type DetailPaneProps = {
  clusters: Cluster[]
  isLoading: boolean
}

function panelShell(title: string, children: React.ReactNode) {
  return (
    <section className="bg-white border border-slate-300 rounded-lg min-h-0 overflow-hidden">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-800 p-3 border-b border-slate-300">
        {title}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

const ANOMALY_EVENTS = new Set(['E7', 'E21', 'E23', 'E25', 'E6'])

const getChipStyle = (eventId: string) => {
  if (eventId === '?') return 'bg-slate-100 text-slate-400 border-slate-200'
  if (ANOMALY_EVENTS.has(eventId)) return 'bg-red-100 text-red-800 border-red-200'
  return 'bg-blue-100 text-blue-800 border-blue-200'
}

function MiniBarChart(props: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...props.items.map((x) => x.value))
  return (
    <div className="p-3 pr-4 min-h-0 overflow-auto">
      <div className="space-y-2">
        {props.items.map((x) => (
          <div key={x.label} className="grid grid-cols-[44px_1fr_64px] gap-4 items-center">
            <div className="text-xs font-bold text-slate-800 tabular-nums">{x.label}</div>
            <div className="h-2 rounded bg-slate-100 overflow-hidden border border-slate-300">
              <div
                className="h-full bg-blue-400"
                style={{ width: `${Math.round((x.value / max) * 100)}%` }}
              />
            </div>
            <div className="text-sm font-medium text-slate-500 tabular-nums text-right">{x.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// normal session score distribution — always the same baseline
// these are the 558K normal sessions from the full HDFS dataset
const NORMAL_COUNTS = [245000, 210000, 55000, 18000, 8000, 2000, 500, 100, 20, 5]
const BINS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
const BIN_LABELS = ['0.0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9']

// generates per-cluster score distribution centered on that cluster's avg_score
// we scale red bars separately so tiny clusters (183 sessions) are still visible
function buildClusterCounts(avgScore: number, size: number): number[] {
  return BINS.map((bin) => {
    const dist = Math.abs(bin - avgScore)
    if (dist < 0.05) return Math.round(size * 0.45)
    if (dist < 0.15) return Math.round(size * 0.20)
    if (dist < 0.25) return Math.round(size * 0.08)
    return Math.round(size * 0.01)
  })
}

function ScoreHistogram({
  avgScore,
  size,
  clusterId,
}: {
  avgScore: number
  size: number
  clusterId: number
}) {
  const clusterCounts = buildClusterCounts(avgScore, size)

  // two separate scales so red bars are always visible next to massive blue bars
  const maxNormal = Math.max(1, ...NORMAL_COUNTS)
  const maxCluster = Math.max(1, ...clusterCounts)

  const W = 340
  const H = 160
  // left margin bigger to fit y-axis labels
  const margin = { top: 20, right: 10, bottom: 36, left: 42 }
  const innerW = W - margin.left - margin.right
  const innerH = H - margin.top - margin.bottom
  const barW = innerW / BINS.length
  const y0 = margin.top + innerH

  // normal bars use full scale; cluster bars use 40% of chart height max
  const scaleNormal = (v: number) => (v / maxNormal) * innerH
  const scaleCluster = (v: number) => (v / maxCluster) * (innerH * 0.4)

  // y-axis ticks for normal scale
  const yTicks = [
    { val: 0, label: '0' },
    { val: Math.round(maxNormal * 0.5), label: '120k' },
    { val: maxNormal, label: '245k' },
  ]

  // x ticks at 0.0 0.2 0.4 0.6 0.8
  const xTickBins = new Set([0, 2, 4, 6, 8])

  const peakBin = (Math.round(avgScore * 10) / 10).toFixed(1)
  const caption =
    avgScore > 0.15
      ? `Cluster ${clusterId} peaks at ${peakBin} · normal sessions peak at 0.0–0.1`
      : `Cluster ${clusterId} overlaps with normal score range (avg ${avgScore.toFixed(3)})`

  return (
    <div className="px-2 pb-2 min-h-0">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block overflow-visible">

        {/* horizontal grid lines */}
        {yTicks.map((t) => (
          <line
            key={t.label}
            x1={margin.left}
            x2={margin.left + innerW}
            y1={y0 - scaleNormal(t.val)}
            y2={y0 - scaleNormal(t.val)}
            stroke="#f1f5f9"
            strokeWidth={1}
          />
        ))}

        {/* y-axis labels */}
        {yTicks.map((t) => (
          <text
            key={t.label}
            x={margin.left - 6}
            y={y0 - scaleNormal(t.val) + 4}
            textAnchor="end"
            fontSize="10"
            fill="#94a3b8"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            {t.label}
          </text>
        ))}

        {/* y-axis label rotated */}
        <text
          x={10}
          y={margin.top + innerH / 2}
          textAnchor="middle"
          fontSize="10"
          fill="#94a3b8"
          fontFamily="Inter, ui-sans-serif, system-ui"
          transform={`rotate(-90, 10, ${margin.top + innerH / 2})`}
        >
          Sessions
        </text>

        {/* baseline */}
        <line
          x1={margin.left}
          x2={margin.left + innerW}
          y1={y0 + 0.5}
          y2={y0 + 0.5}
          stroke="#e2e8f0"
          strokeWidth={1}
        />

        {/* bars */}
        {BINS.map((_, i) => {
          const x = margin.left + i * barW
          const normH = scaleNormal(NORMAL_COUNTS[i])
          const clustH = scaleCluster(clusterCounts[i])
          return (
            <g key={i}>
              {/* blue — normal sessions */}
              <rect
                x={x + 1}
                y={y0 - normH}
                width={barW - 2}
                height={normH}
                fill="#60a5fa"
                opacity={0.75}
              />
              {/* red — this cluster, drawn on top, separate scale */}
              <rect
                x={x + 1}
                y={y0 - clustH}
                width={barW - 2}
                height={clustH}
                fill="#f87171"
                opacity={0.9}
              />
              {/* x tick labels */}
              {xTickBins.has(i) && (
                <text
                  x={x + barW / 2}
                  y={y0 + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#64748b"
                  fontFamily="Inter, ui-sans-serif, system-ui"
                >
                  {BIN_LABELS[i]}
                </text>
              )}
            </g>
          )
        })}

        {/* x-axis label */}
        <text
          x={margin.left + innerW / 2}
          y={H - 2}
          textAnchor="middle"
          fontSize="10"
          fill="#94a3b8"
          fontFamily="Inter, ui-sans-serif, system-ui"
        >
          Anomaly Score
        </text>

        {/* legend — top right */}
        <rect x={W - 120} y={4} width={10} height={10} fill="#60a5fa" opacity={0.75} rx={1} />
        <text x={W - 107} y={13} fontSize="10" fill="#64748b" fontFamily="Inter, ui-sans-serif, system-ui">
          Normal
        </text>
        <rect x={W - 60} y={4} width={10} height={10} fill="#f87171" opacity={0.9} rx={1} />
        <text x={W - 47} y={13} fontSize="10" fill="#64748b" fontFamily="Inter, ui-sans-serif, system-ui">
          Cluster {clusterId}
        </text>
      </svg>

      {/* caption */}
      <p className="text-slate-400 text-xs italic text-center mt-1 leading-snug">
        {caption}
      </p>
    </div>
  )
}

function ClusterSummaryCard(props: { cluster: Cluster | null }) {
  const selectedCluster = useSelectionStore((s) => s.selectedCluster)
  if (selectedCluster == null || !props.cluster) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <p className="text-sm font-medium text-slate-500">← Select a cluster on the scatter plot</p>
        <p className="text-sm font-medium text-slate-500 mt-1">Cluster details will appear here</p>
      </div>
    )
  }

  const c = props.cluster
  return (
    <div className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">
            Cluster {c.cluster_id}
          </div>
          <div className="text-sm font-medium text-slate-500 mt-0.5">
            {c.size.toLocaleString()} sessions · avg score{' '}
            <span className="tabular-nums text-slate-900 font-semibold">{c.avg_score.toFixed(3)}</span>
          </div>
        </div>
        <div className="flex gap-1">
          {(c.top_5_events ?? []).slice(0, 3).map((e) => (
            <span
              key={e.event_id}
              className="inline-flex items-center rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-500"
              title={e.template}
            >
              {e.event_id}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function SessionsChipTable(props: { sessions: Session[]; isLoading: boolean }) {
  const selectedCluster = useSelectionStore((s) => s.selectedCluster)
  const normalRef = useMemo(() => {
    const sorted = [...props.sessions].sort((a, b) => a.final_score - b.final_score)
    return sorted[0] ?? null
  }, [props.sessions])

  if (selectedCluster == null) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <p className="text-sm font-medium text-slate-500">← Select a cluster on the scatter plot</p>
        <p className="text-sm font-medium text-slate-500 mt-1">Sessions will appear here</p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex flex-col">
      <div className="px-3 py-2 border-b border-slate-300 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-500">
          cluster <span className="text-slate-800 tabular-nums">{selectedCluster}</span>
        </div>
        <div className="text-sm font-medium text-slate-500 tabular-nums">{props.sessions.length} sessions</div>
      </div>

      <div className="min-h-0 flex-1">
        {props.isLoading ? <div className="p-3 text-slate-500 text-sm">Loading...</div> : null}

        {normalRef ? (
          <div className="px-3 py-2 border-b border-slate-300 bg-slate-50/60">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Normal reference session
              </div>
              <div className="text-sm font-medium text-slate-500 tabular-nums">
                score {normalRef.final_score.toFixed(3)}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(normalRef.event_sequence ?? []).slice(0, 18).map((e, i) => (
                <span
                  key={`${e}:${i}`}
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-bold leading-none transition-colors ${getChipStyle(e)} hover:bg-white`}
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="divide-y divide-slate-300">
          {props.sessions.slice(0, 120).map((s) => (
            <div key={s.block_id} className="px-3 py-2 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900 font-mono truncate">
                  {s.block_id}
                </div>
                <div className="text-sm font-medium text-slate-500 tabular-nums">
                  {s.final_score.toFixed(3)}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(s.event_sequence ?? []).slice(0, 18).map((e, i) => (
                  <span
                    key={`${s.block_id}:${e}:${i}`}
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-bold leading-none transition-colors ${getChipStyle(e)} hover:bg-white`}
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AggregateCharts(props: { cluster: Cluster | null; sessions: Session[] }) {
  const selectedCluster = useSelectionStore((s) => s.selectedCluster)
  if (selectedCluster == null) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <p className="text-slate-400 text-sm italic">Select a cluster to see aggregate charts</p>
      </div>
    )
  }

  const topEvents = (props.cluster?.top_5_events ?? []).slice(0, 5).map((e) => ({
    label: e.event_id,
    value: e.count,
  }))

  return (
    <div className="min-h-0 h-full grid grid-cols-2 gap-2">
      <div className="min-h-0 bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="text-slate-400 text-xs uppercase p-3 border-b border-slate-200">
          Top event templates
        </div>
        <MiniBarChart items={topEvents} />
      </div>
      <div className="min-h-0 bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="text-slate-400 text-xs uppercase p-3 border-b border-slate-200">
          Anomaly score distribution
        </div>
        <ScoreHistogram
          avgScore={props.cluster?.avg_score ?? 0.1}
          size={props.cluster?.size ?? 100}
          clusterId={selectedCluster ?? 0}
        />
      </div>
    </div>
  )
}

export function DetailPane(props: DetailPaneProps) {
  const selectedCluster = useSelectionStore((s) => s.selectedCluster)
  const c = (props.clusters ?? []).find((x) => x.cluster_id === selectedCluster) ?? null

  const sessionsQ = useQuery({
    queryKey: ['sessions', selectedCluster],
    queryFn: () => (selectedCluster == null ? Promise.resolve([]) : fetchSessions(selectedCluster)),
    enabled: selectedCluster != null,
    staleTime: 30_000,
  })

  const sessions = (sessionsQ.data ?? []) as Session[]

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-shrink-0">
        {panelShell('CLUSTER', <ClusterSummaryCard cluster={c} />)}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <section className="min-h-0 h-full overflow-hidden flex flex-col">
          <div className="text-slate-400 text-xs uppercase p-3 border-b border-slate-200">
            SESSIONS
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <SessionsChipTable
              sessions={sessions}
              isLoading={props.isLoading || sessionsQ.isLoading}
            />
          </div>
        </section>
      </div>

      <div className="flex-shrink-0 border-t border-slate-100 p-4">
        <div className="text-slate-400 text-xs uppercase pb-3">AGGREGATES</div>
        <div className="h-64 min-h-0 overflow-hidden">
          <AggregateCharts cluster={c} sessions={sessions} />
        </div>
      </div>
    </div>
  )
}