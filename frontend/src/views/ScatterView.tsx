import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { OrthographicView } from '@deck.gl/core'
import { ScatterplotLayer } from '@deck.gl/layers'
import DeckGL from '@deck.gl/react'

import type { Cluster, EmbeddingPoint } from '../types'
import { useSelectionStore } from '../store/selection'

type Pt = EmbeddingPoint

function colorForCluster(clusterId: number): [number, number, number, number] {
  // fixed palette: distinct hues that survive dark mode + are mostly colorblind-safe
  switch (clusterId) {
    case -1:
      return [156, 163, 175, 100]
    case 0:
      return [239, 68, 68, 220]
    case 6:
      return [249, 115, 22, 220]
    case 8:
      return [234, 179, 8, 220]
    case 14:
      return [34, 197, 94, 220]
    case 5:
      return [59, 130, 246, 220]
    case 3:
      return [168, 85, 247, 220]
    case 7:
      return [236, 72, 153, 220]
    default:
      return [148, 163, 184, 140]
  }
}

type ScatterViewProps = {
  points: EmbeddingPoint[]
  clusters: Cluster[]
  isLoading: boolean
}

export function ScatterView(props: ScatterViewProps) {
  const selectedCluster = useSelectionStore((s) => s.selectedCluster)
  const setSelectedCluster = useSelectionStore((s) => s.setSelectedCluster)
  const hoveredCluster = useSelectionStore((s) => s.hoveredCluster)
  const setHoveredCluster = useSelectionStore((s) => s.setHoveredCluster)
  const timeRange = useSelectionStore((s) => s.timeRange)
  const scoreThreshold = useSelectionStore((s) => s.scoreThreshold)

  const points = (props.points ?? []) as Pt[]
  const [hovered, setHovered] = useState<Pt | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dims, setDims] = useState({ width: 800, height: 500 })

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const filtered = useMemo(
    () => points.filter((p) => p.final_score >= scoreThreshold),
    [points, scoreThreshold]
  )

  const withHour = useMemo(() => {
    // mock linkage: assign an hour bucket so time brushing can dim points —
    // real backend will ship timestamps later, this is demo glue
    return filtered.map((p, i) => ({ ...p, _hour: i % 38 }))
  }, [filtered])

  const bounds = useMemo(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    for (const p of withHour) {
      minX = Math.min(minX, p.umap_x)
      maxX = Math.max(maxX, p.umap_x)
      minY = Math.min(minY, p.umap_y)
      maxY = Math.max(maxY, p.umap_y)
    }
    if (!Number.isFinite(minX)) return { minX: -5, maxX: 5, minY: -5, maxY: 5 }
    return { minX, maxX, minY, maxY }
  }, [withHour])

  const viewState = useMemo(() => {
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    const rangeX = Math.max(1e-6, bounds.maxX - bounds.minX)
    const rangeY = Math.max(1e-6, bounds.maxY - bounds.minY)
    const range = Math.max(rangeX, rangeY)
    const zoom = Math.log2(Math.min(dims.width, dims.height) / range) - 1
    return {
      target: [centerX, centerY, 0] as [number, number, number],
      zoom,
    }
  }, [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, dims.height, dims.width])

  const views = useMemo(
    () => [new OrthographicView({ id: 'ortho', controller: true })],
    []
  )

  const handleClick = useCallback(
    ({ object }: { object: any | null }) => {
      if (object) setSelectedCluster(object.cluster_id)
    },
    [setSelectedCluster]
  )

  const handleHover = useCallback(
    ({ object }: { object: any | null }) => {
      const p = (object as any) ?? null
      setHovered(p)
      setHoveredCluster(p?.cluster_id ?? null)
    },
    [setHoveredCluster]
  )

  // deck.gl is the least painful way to render interactive scatter at scale —
  // canvas/WebGL keeps hover + selection smooth when points grow beyond "toy"
  // updateTriggers matter in deck.gl because it caches accessors aggressively —
  // without them you change state and the layer just stares back, unbothered
  const layers = useMemo(
    () => [
      new ScatterplotLayer<any>({
        id: 'umap-points',
        data: withHour,
        getPosition: (d) => [d.umap_x, d.umap_y],
        getRadius: (d) => (d.cluster_id === hoveredCluster ? 8 : 5),
        radiusUnits: 'pixels',
        getFillColor: (d) => {
          const base = colorForCluster(d.cluster_id)
          const inRange =
            timeRange == null ||
            (d._hour >= timeRange[0] && d._hour <= timeRange[1])
          const alpha = inRange ? base[3] : 30
          return [base[0], base[1], base[2], alpha]
        },
        pickable: true,
        onClick: handleClick,
        onHover: handleHover,
        updateTriggers: {
          getFillColor: [selectedCluster, timeRange],
          getRadius: [hoveredCluster],
        },
      }),
    ],
    [handleClick, handleHover, hoveredCluster, selectedCluster, timeRange, withHour]
  )

  const legendItems = (props.clusters ?? []).filter((c) => c.cluster_id !== -1)

  return (
    <div className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <div className="text-slate-500 text-xs uppercase tracking-wider">
          UMAP scatter
        </div>
        <div className="text-xs text-slate-500">
          threshold ≥ {scoreThreshold.toFixed(2)} •{' '}
          {selectedCluster == null ? 'no cluster selected' : `selected ${selectedCluster}`}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}
      >
        {props.isLoading ? (
          <div className="p-3 text-slate-500 text-sm">Loading...</div>
        ) : (
          <DeckGL
            views={views}
            initialViewState={viewState}
            layers={layers}
            width={dims.width}
            height={dims.height}
            key={`${dims.width}x${dims.height}:${bounds.minX}:${bounds.minY}:${bounds.maxX}:${bounds.maxY}`}
            style={{ background: '#ffffff' }}
            getTooltip={({ object }) => {
              const p = object as any | null
              if (!p) return null
              return {
                text: `block_id=${p.block_id}\ncluster=${p.cluster_id}\nscore=${p.final_score.toFixed(3)}\nhour=${p._hour}`,
              }
            }}
          />
        )}

        <div className="absolute bottom-3 left-3 w-64 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow">
          <div className="text-slate-500 font-medium uppercase tracking-wider text-[11px]">
            Clusters
          </div>
          <div className="mt-2 space-y-2">
            {legendItems.map((c) => {
              const rgba = colorForCluster(c.cluster_id)
              return (
                <div key={c.cluster_id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full border border-slate-200"
                      style={{ backgroundColor: `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] / 255})` }}
                    />
                    <div className="text-slate-500">cluster {c.cluster_id}</div>
                  </div>
                  <div className="text-slate-500 tabular-nums">{c.size}</div>
                </div>
              )
            })}
          </div>
        </div>

        {hovered ? (
          <div className="absolute bottom-3 right-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow">
            <div className="text-slate-900 font-medium">{hovered.block_id}</div>
            <div className="text-slate-500">
              cluster {hovered.cluster_id} • score {hovered.final_score.toFixed(3)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

