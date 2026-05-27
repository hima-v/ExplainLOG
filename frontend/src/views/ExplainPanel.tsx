import { useQuery } from '@tanstack/react-query'

import { useSelectionStore } from '../store/selection'
import type { Cluster } from '../types'

type Explain = {
  summary: string
  pattern: string
  likely_cause: string
  severity: 'high' | 'medium' | 'low'
  next_steps: string[]
}

function severityBadge(sev: Explain['severity']) {
  const cls =
    sev === 'high'
      ? 'bg-red-100 text-red-700 border border-red-200'
      : sev === 'medium'
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-green-100 text-green-700'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${cls}`}>
      {sev}
    </span>
  )
}

type ExplainPanelProps = {
  clusters: Cluster[]
  isLoading: boolean
}

export function ExplainPanel(props: ExplainPanelProps) {
  const selectedCluster = useSelectionStore((s) => s.selectedCluster)

  const c = (props.clusters ?? []).find((x) => x.cluster_id === selectedCluster) ?? null

  const { data } = useQuery({
    queryKey: ['explain-v2', selectedCluster],
    queryFn: async () => {
      // hardcoded explanation is the Phase-1 demo placeholder —
      // real SSE streaming comes in Phase 2 once backend is wired up
      if (selectedCluster == null) return null
      if (selectedCluster === 0) {
        return {
          summary: 'Blocks failed mid-transfer due to receiveBlock exception',
          pattern:
            'Block allocated and write began (E22), data received (E5), then E7 exception terminated sequence. Normal finalization events E26/E11 never appear.',
          likely_cause:
            'DataNode disk full or network dropout during transfer window causing abrupt abort.',
          severity: 'high',
          next_steps: [
            'Check DataNode disk space',
            'Review crash logs',
            'Confirm auto re-replication',
            'Check network stability',
          ],
        } satisfies Explain
      }

      const top = (c?.top_5_events ?? []).slice(0, 3).map((e) => e.event_id).join(', ')
      return {
        summary: `Cluster ${selectedCluster} looks like repeated ${top} patterns`,
        pattern:
          'Sequences share a similar prefix and then diverge; the model is flagging them as structurally atypical compared to the background.',
        likely_cause:
          'Could be a transient pipeline issue (replication / responder) or a localized host problem. Needs correlation with time brush + sample blocks.',
        severity: (c?.avg_score ?? 0) > 0.22 ? 'high' : (c?.avg_score ?? 0) > 0.15 ? 'medium' : 'low',
        next_steps: [
          'Compare sample blocks for common datanode hostnames',
          'Check for spikes in retries / replication errors',
          'Inspect the most frequent templates for this cluster',
        ],
      } satisfies Explain
    },
    staleTime: 30_000,
  })

  // reset behavior: queryKey includes selectedCluster, so switching clusters swaps explanation cleanly
  if (selectedCluster == null) {
    return (
      <div className="h-full w-full rounded-lg border border-slate-300 border-dashed bg-white shadow-sm flex items-center justify-center text-slate-400">
        Select a cluster to see AI explanation
      </div>
    )
  }

  return (
    <div className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm min-h-0 flex flex-col">
      <div className="px-3 py-2 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="text-slate-500 text-xs uppercase tracking-wider">
            LLM Explain — cluster {selectedCluster}
          </div>
          <div className="text-xs text-slate-500" />
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div>
              size <span className="text-slate-900 tabular-nums">{c?.size ?? '—'}</span>
            </div>
            <div>
              avg_score{' '}
              <span className="text-slate-900 tabular-nums">{(c?.avg_score ?? 0).toFixed(3)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 justify-end">
            {(c?.top_5_events ?? []).slice(0, 3).map((e) => (
              <span
                key={e.event_id}
                className="inline-flex items-center rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500"
              >
                {e.event_id}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 space-y-4">
        {props.isLoading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div className="text-slate-800 font-medium text-sm">{data?.summary ?? ''}</div>
          {data ? severityBadge(data.severity) : null}
        </div>

        <div>
          <div className="text-slate-500 text-xs uppercase tracking-wider">pattern</div>
          <p className="mt-2 text-slate-600 text-sm leading-relaxed">{data?.pattern ?? ''}</p>
        </div>

        <div>
          <div className="text-slate-500 text-xs uppercase tracking-wider">likely_cause</div>
          <p className="mt-2 text-slate-600 text-sm leading-relaxed">
            {data?.likely_cause ?? ''}
          </p>
        </div>

        <div>
          <div className="text-slate-500 text-xs uppercase tracking-wider">next steps</div>
          <ul className="mt-2 list-disc pl-4 space-y-1">
            {(data?.next_steps ?? []).map((s, i) => (
              <li key={i} className="text-slate-700 text-sm">
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            className="border border-slate-300 rounded px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
            onClick={() => console.log('confirm', { cluster_id: selectedCluster })}
          >
            Confirm
          </button>
          <button
            className="border border-slate-300 rounded px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
            onClick={() => console.log('reject', { cluster_id: selectedCluster })}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}

