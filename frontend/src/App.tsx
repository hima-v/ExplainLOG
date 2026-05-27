import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'

import { Layout } from './components/Layout'
import { TimelineView } from './views/TimelineView'
import { ScatterView } from './views/ScatterView'
import { ClusterTable } from './views/ClusterTable'
import { ExplainPanel } from './views/ExplainPanel'
import {
  fetchClusters,
  fetchEmbeddings,
  fetchTimeline,
} from './api/client'

const queryClient = new QueryClient()

function AppInner() {
  const clustersQ = useQuery({ queryKey: ['clusters'], queryFn: fetchClusters, staleTime: 60_000 })
  const embeddingsQ = useQuery({ queryKey: ['embeddings'], queryFn: fetchEmbeddings, staleTime: 60_000 })
  const timelineQ = useQuery({ queryKey: ['timeline'], queryFn: fetchTimeline, staleTime: 60_000 })

  const clusters = clustersQ.data ?? []
  const embeddings = embeddingsQ.data ?? []
  const timeline = timelineQ.data ?? []

  const flaggedCount = embeddings.filter((p) => p.final_score >= 0.1).length
  const sessionCount = 575_061

  return (
    <Layout
      flaggedCount={flaggedCount}
      sessionCount={sessionCount}
      timeline={<TimelineView bins={timeline} isLoading={timelineQ.isLoading} />}
      scatter={
        <ScatterView
          clusters={clusters}
          points={embeddings}
          isLoading={embeddingsQ.isLoading || clustersQ.isLoading}
        />
      }
      table={<ClusterTable clusters={clusters} isLoading={clustersQ.isLoading} />}
      explain={<ExplainPanel clusters={clusters} isLoading={clustersQ.isLoading} />}
    />
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}

export default App
