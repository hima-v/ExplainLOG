import type {
  Cluster,
  ClusterExplanation,
  EmbeddingPoint,
  Session,
  TimelineBin,
} from '../types'

export const USE_MOCK = true

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
      const all = ((mod.default ?? []) as Session[]).filter(
        (s) => s.cluster_id === clusterId
      )
      return all
    }
    return (await _fetchJson<Session[]>(`/sessions?cluster_id=${clusterId}`)) ?? []
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
  try {
    if (USE_MOCK) {
      return {
        cluster_id: clusterId,
        title: `Cluster ${clusterId}: likely receiveBlock instability`,
        summary:
          'Sessions in this cluster show repeated receive/write patterns with intermittent exceptions. The sequence structure suggests transient network/datanode issues rather than steady-state load.',
        hypotheses: [
          'PacketResponder failures causing retries and elongated sequences',
          'Replication pipeline churn (node flapping / slow disks)',
          'Downstream writeBlock backpressure producing repeated E22 patterns',
        ],
        next_checks: [
          'Compare datanode hostnames for sample blocks (is it one bad actor?)',
          'Check disk IO latency around the brushed time window',
          'Inspect exceptions around EventTemplate "Exception in receiveBlock"',
        ],
      }
    }

    const res = await _fetchJson<ClusterExplanation>(
      `/explain?cluster_id=${clusterId}`
    )
    return (
      res ?? {
        cluster_id: clusterId,
        title: `Cluster ${clusterId}`,
        summary: '',
        hypotheses: [],
        next_checks: [],
      }
    )
  } catch {
    return {
      cluster_id: clusterId,
      title: `Cluster ${clusterId}`,
      summary: '',
      hypotheses: [],
      next_checks: [],
    }
  }
}

