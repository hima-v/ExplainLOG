export type ClusterEvent = {
  event_id: string
  count: number
  template: string
}

export type Cluster = {
  cluster_id: number
  size: number
  avg_score: number
  anomaly_rate: number
  top_5_events: ClusterEvent[]
  sample_blocks: string[]
}

export type EmbeddingPoint = {
  block_id: string
  umap_x: number
  umap_y: number
  final_score: number
  cluster_id: number
}

export type Session = {
  block_id: string
  event_sequence: string[]
  seq_length: number
  final_score: number
  is_anomaly: boolean
}

export type TimelineBin = {
  hour: number
  timestamp: string
  anomaly_count: number
  total_count: number
}

export type ClusterExplanation = {
  summary: string
  pattern: string
  likely_cause: string
  severity: string
  next_steps: string[]
}

