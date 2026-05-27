export type ClusterEvent = {
  event_id: string
  count: number
  template: string
}

export type Cluster = {
  cluster_id: number
  size: number
  avg_score: number
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
  cluster_id: number
  is_anomaly: boolean
}

export type TimelineBin = {
  hour: number
  timestamp: string
  anomaly_count: number
  total_count: number
}

export type ClusterExplanation = {
  cluster_id: number
  title: string
  summary: string
  hypotheses: string[]
  next_checks: string[]
}

