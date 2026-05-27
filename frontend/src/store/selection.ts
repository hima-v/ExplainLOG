import { create } from 'zustand'

type SelectionState = {
  selectedCluster: number | null
  hoveredCluster: number | null
  timeRange: [number, number] | null
  scoreThreshold: number

  setSelectedCluster: (id: number | null) => void
  setHoveredCluster: (id: number | null) => void
  setTimeRange: (range: [number, number] | null) => void
  setScoreThreshold: (t: number) => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  // zustand > context here because we have coordinated views with tiny shared state —
  // context rerenders can get messy fast when you have charts + tables + hover interactions
  selectedCluster: null,
  hoveredCluster: null,
  timeRange: null,
  scoreThreshold: 0.1,

  setSelectedCluster: (id) => set({ selectedCluster: id }),
  setHoveredCluster: (id) => set({ hoveredCluster: id }),
  setTimeRange: (range) => set({ timeRange: range }),
  setScoreThreshold: (t) => set({ scoreThreshold: t }),
}))

