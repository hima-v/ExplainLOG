import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { OrthographicViewState } from '@deck.gl/core'
import { OrthographicView } from '@deck.gl/core'
import { ScatterplotLayer } from '@deck.gl/layers'
import DeckGL from '@deck.gl/react'

import type { Cluster, EmbeddingPoint } from '../types'
import { useSelectionStore } from '../store/selection'

type Pt = EmbeddingPoint

function colorForCluster(clusterId: number): [number, number, number, number] {
  switch (clusterId) {
    case -1:
      return [156, 163, 175, 100]
    case 0:
      return [31, 119, 180, 220] // #1f77b4
    case 1:
      return [214, 39, 40, 220] // #d62728
    case 2:
      return [44, 160, 44, 220] // #2ca02c
    case 3:
      return [255, 127, 14, 220] // #ff7f0e
    case 4:
      return [148, 103, 189, 220] // #9467bd
    case 5:
      return [140, 86, 75, 220] // #8c564b
    case 6:
      return [227, 119, 194, 220] // #e377c2
    case 7:
      return [127, 127, 127, 220] // #7f7f7f
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
    const zoom =
      Math.log2(Math.min(dims.width, dims.height) / Math.max(rangeX, rangeY)) - 0.3
    return {
      ortho: {
        target: [centerX, centerY, 0] as [number, number, number],
        zoom,
      } satisfies OrthographicViewState,
    }
  }, [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, dims.height, dims.width])

  const views = useMemo(
    () => [new OrthographicView({ id: 'ortho', controller: true })],
    []
  )

  const handleClick = useCallback(
    (info: { object?: any | null }) => {
      const object = info.object ?? null
      if (object) setSelectedCluster(object.cluster_id)
    },
    [setSelectedCluster]
  )

  const handleHover = useCallback(
    (info: { object?: any | null }) => {
      const p = (info.object as any) ?? null
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
        getRadius: (d) => (d.cluster_id === hoveredCluster ? 18 : 12),
        radiusUnits: 'pixels',
        radiusMinPixels: 8,
        radiusMaxPixels: 20,
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
    <div className="h-full w-full overflow-hidden flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between px-0 py-0 mb-2">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
          UMAP scatter
        </div>
        <div className="text-xs text-slate-500">
          threshold ≥ {scoreThreshold.toFixed(2)} •{' '}
          {selectedCluster == null ? 'no cluster selected' : `selected ${selectedCluster}`}
        </div>
      </div>

      <div className="flex items-center gap-4 px-3 pb-2 text-xs text-slate-500">
        <span>Detector blend:</span>
        <input type="range" min={0} max={1} step={0.1} defaultValue={0.9} className="w-24 h-1" />
        <span>LSTM 90%</span>
        <span className="ml-4">Threshold:</span>
        <input type="range" min={0} max={1} step={0.05} defaultValue={0.1} className="w-24 h-1" />
        <span>0.10</span>
      </div>

      <div className="flex-1 flex flex-row w-full overflow-hidden p-4 gap-4 min-h-0">
        <div className="w-56 flex-shrink-0 flex flex-col bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm min-h-0">
          <div className="flex-shrink-0 px-3 py-2 border-b border-slate-300">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Clusters
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 min-h-0">
            <div className="space-y-2">
              {legendItems.map((c) => {
                const rgba = colorForCluster(c.cluster_id)
                return (
                  <div key={c.cluster_id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-3 w-3 rounded-full border border-slate-300 flex-shrink-0"
                        style={{
                          backgroundColor: `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] / 255})`,
                        }}
                      />
                      <div className="text-sm font-medium text-slate-500 truncate">
                        cluster {c.cluster_id}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-slate-500 tabular-nums">
                      {c.size}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50/50 min-h-0">
          <div
            ref={containerRef}
            className="absolute inset-0 overflow-hidden"
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
              const score =
                typeof p.final_score === 'number' ? p.final_score.toFixed(3) : String(p.final_score ?? '—')
              const cluster = String(p.cluster_id ?? '—')
              const block = String(p.block_id ?? '—')

              return {
                html: `
                  <div style="font-family: Inter, sans-serif; font-size: 12px;">
                    <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">
                      Block: ${block}
                    </div>
                    <div style="color: #64748b;">
                      Cluster: <span style="font-weight: 500; color: #0f172a;">${cluster}</span>
                    </div>
                    <div style="color: #64748b;">
                      Score: <span style="font-weight: 500; color: #0f172a;">${score}</span>
                    </div>
                  </div>
                `,
                style: {
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  boxShadow: 'rgba(0, 0, 0, 0.1) 0px 4px 6px',
                  padding: '8px 12px',
                  color: '#0f172a',
                },
              }
                }}
              />
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

