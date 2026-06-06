import type {
  Cluster,
  ClusterExplanation,
  EmbeddingPoint,
  Session,
  TimelineBin,
} from '../types'

export const USE_MOCK = false

const API_BASE = 'http://localhost:8000/api'

async function _fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchClusters(): Promise<Cluster[]> {
  try {
    if (USE_MOCK) {
      const mod = await import('../mocks/clusters.json')
      return (mod.default ?? []) as Cluster[]
    }
    return (await _fetchJson<Cluster[]>('/clusters')) ?? []
  } catch {
    return []
  }
}

export async function fetchEmbeddings(): Promise<EmbeddingPoint[]> {
  try {
    if (USE_MOCK) {
      const mod = await import('../mocks/embeddings.json')
      return (mod.default ?? []) as EmbeddingPoint[]
    }
    return (await _fetchJson<EmbeddingPoint[]>('/embeddings')) ?? []
  } catch {
    return []
  }
}

export async function fetchSessions(clusterId: number): Promise<Session[]> {
  try {
    if (USE_MOCK) {
      const mod = await import('../mocks/sessions.json')
      const all = ((mod.default ?? []) as Array<Session & { cluster_id?: number }>).filter(
        (s) => s.cluster_id === clusterId
      )
      return all
    }
    return (await _fetchJson<Session[]>(`/clusters/${clusterId}/sessions`)) ?? []
  } catch {
    return []
  }
}

export async function fetchTimeline(): Promise<TimelineBin[]> {
  try {
    if (USE_MOCK) {
      const mod = await import('../mocks/timeline.json')
      return (mod.default ?? []) as TimelineBin[]
    }
    return (await _fetchJson<TimelineBin[]>('/timeline')) ?? []
  } catch {
    return []
  }
}

export async function fetchExplanation(
  clusterId: number
): Promise<ClusterExplanation> {
  if (USE_MOCK) {
    return {
      summary: 'Blocks failed mid-transfer due to receiveBlock exception',
      pattern:
        'Block allocated and write began (E22), data received (E5), then E7 exception terminated the sequence. Normal finalization events E26/E11 never appear.',
      likely_cause:
        'DataNode disk full or network dropout during transfer window causing abrupt abort.',
      severity: 'high',
      next_steps: [
        'Check DataNode disk space',
        'Review crash logs 20:35-20:45',
        'Confirm auto re-replication',
        'Check network stability',
      ],
    }
  }

  return new Promise((resolve, reject) => {
    const es = new EventSource(
      `http://localhost:8000/api/clusters/${clusterId}/explain`
    )

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // Skip delta events, wait for the full explanation object.
        if (data.summary !== undefined) {
          es.close()
          resolve(data as ClusterExplanation)
        }
      } catch {
        // Still streaming partial tokens, keep waiting.
      }
    }

    es.onerror = () => {
      es.close()
      reject(new Error('SSE connection failed'))
    }

    setTimeout(() => {
      es.close()
      reject(new Error('explain timeout'))
    }, 30000)
  })
}

export async function submitExplanationFeedback(
  clusterId: number,
  label: 'confirm' | 'reject',
  note = ''
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cluster_id: clusterId,
        label,
        note,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

