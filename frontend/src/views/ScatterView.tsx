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
      return [156, 163, 175, 40]
    case 0:
      return [0, 98, 155, 220] // #00629b
    case 1:
      return [190, 56, 27, 220] // #be381b
    case 2:
      return [0, 136, 93, 220] // #00885d
    case 3:
      return [242, 142, 43, 220] // #f28e2b
    case 4:
      return [118, 78, 159, 220] // #764e9f
    case 5:
      return [89, 89, 89, 220] // #595959
    case 6:
      return [214, 90, 164, 220] // #d65aa4
    case 7:
      return [82, 138, 35, 220] // #528a23
    case 8:
      return [76, 114, 176, 220] // #4c72b0
    case 14:
      return [221, 132, 82, 220] // #dd8452
    default:
      return [156, 163, 175, 180]
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
      if (width > 0 && height > 0) {
        setDims((prev) =>
          prev.width === width && prev.height === height ? prev : { width, height }
        )
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const filtered = useMemo(
    () => points.filter((p) => p.final_score >= scoreThreshold),
    [points, scoreThreshold]
  )

  const bounds = useMemo(() => {
    const xs = points.map((p) => p.umap_x)
    const ys = points.map((p) => p.umap_y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    if (!Number.isFinite(minX)) return { minX: -5, maxX: 5, minY: -5, maxY: 5 }
    return { minX, maxX, minY, maxY }
  }, [points])

  const viewState = useMemo(() => {
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    const rangeX = Math.max(1e-6, bounds.maxX - bounds.minX)
    const rangeY = Math.max(1e-6, bounds.maxY - bounds.minY)
    const zoom = Math.log2(500 / Math.max(rangeX, rangeY)) - 0.5
    return {
      ortho: {
        target: [centerX, centerY, 0] as [number, number, number],
        zoom,
      } satisfies OrthographicViewState,
    }
  }, [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY])

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
        data: filtered,
        getPosition: (d) => [d.umap_x, d.umap_y],
        getRadius: (d) => (d.cluster_id === hoveredCluster ? 15 : 8),
        radiusUnits: 'pixels',
        radiusMinPixels: 4,
        radiusMaxPixels: 20,
        getFillColor: (d) => {
          const inRange =
            timeRange === null ||
            (d.hour >= timeRange[0] && d.hour <= timeRange[1])
          if (!inRange) return [200, 200, 200, 30]
          if (d.cluster_id === -1) return [156, 163, 175, 40]
          return colorForCluster(d.cluster_id)
        },
        pickable: true,
        onClick: handleClick,
        onHover: handleHover,
        updateTriggers: {
          getFillColor: [selectedCluster, hoveredCluster, timeRange],
          getRadius: [hoveredCluster],
        },
      }),
    ],
    [filtered, handleClick, handleHover, hoveredCluster, selectedCluster, timeRange]
  )

  const legendItems = (props.clusters ?? []).filter((c) => c.cluster_id !== -1)
  const selectedLabel = selectedCluster == null ? 'no cluster selected' : `selected ${selectedCluster}`
  const brushLabel =
    timeRange == null
      ? 'full window'
      : `h${timeRange[0]}-${timeRange[1]} (${Math.abs(timeRange[1] - timeRange[0]) + 1}h)`

  return (
    <div className="h-full w-full overflow-hidden flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between px-1 py-1 mb-2 border-b border-slate-200">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-800 leading-none">
          UMAP scatter
        </div>
        <div className="text-xs text-slate-500 leading-none">
          {brushLabel} • {selectedLabel}
        </div>
      </div>

      <div className="flex-1 flex flex-row w-full overflow-hidden p-4 gap-3 min-h-0">
        <div className="w-44 flex-shrink-0 flex flex-col bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm min-h-0">
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

