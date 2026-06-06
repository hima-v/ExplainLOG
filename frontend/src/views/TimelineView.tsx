import { useEffect, useMemo, useRef, useState } from 'react'

import * as d3 from 'd3'

import type { TimelineBin } from '../types'
import { useSelectionStore } from '../store/selection'

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

type TimelineViewProps = {
  bins: TimelineBin[]
  isLoading: boolean
}

export function TimelineView(props: TimelineViewProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const timeRange = useSelectionStore((s) => s.timeRange)
  const setTimeRange = useSelectionStore((s) => s.setTimeRange)

  const bins = useMemo(() => props.bins ?? [], [props.bins])

  const [width, setWidth] = useState(900)
  const height = 160

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]!.contentRect.width)
      if (Number.isFinite(next) && next > 0) {
        setWidth((prev) => (prev === next ? prev : next))
      }
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return
    if (props.isLoading) return

    const margin = { top: 18, right: 10, bottom: 20, left: 40 }
    const w = Math.max(520, width)
    const h = height

    const hours = bins.map((b) => b.hour)
    const x = d3
      .scaleBand<number>()
      .domain(hours)
      .range([margin.left, w - margin.right])
      .paddingInner(0.12)

    const yMax = (d3.max(bins, (b) => b.anomaly_count) ?? 1) * 1.2
    const y = d3
      .scaleLinear()
      .domain([0, yMax])
      .nice()
      .range([h - margin.bottom, margin.top])

    const root = d3.select(svgEl)
    root.selectAll('*').remove()

    root.attr('viewBox', `0 0 ${w} ${h}`)

    const g = root.append('g')

    g.append('g')
      .selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x', (d) => x(d.hour) ?? 0)
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(d.anomaly_count))
      .attr('height', (d) => Math.max(0, y(0) - y(d.anomaly_count)))
      .attr('fill', '#ef4444')
      .attr('opacity', 0.9)

    const xAxis = d3.axisBottom(x).tickValues([0, 6, 12, 18, 24, 30, 37])
    const yAxis = d3.axisLeft(y).ticks(3)

    g.append('g')
      .attr('transform', `translate(0,${h - margin.bottom})`)
      .call(xAxis)
      .call((sel) =>
        sel.selectAll('text').attr('fill', '#64748b').attr('font-size', 10)
      )
      .call((sel) => sel.selectAll('path,line').attr('stroke', '#e2e8f0'))

    g.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(yAxis)
      .call((sel) =>
        sel.selectAll('text').attr('fill', '#64748b').attr('font-size', 10)
      )
      .call((sel) => sel.selectAll('path,line').attr('stroke', '#e2e8f0'))

    const brush = d3
      .brushX()
      .extent([
        [margin.left, margin.top],
        [w - margin.right, h - margin.bottom],
      ])
      .on('end', (event) => {
        if (!event.sourceEvent) return

        if (!event.selection) {
          setTimeRange(null)
          return
        }
        const [sx0, sx1] = event.selection as [number, number]

        const step = x.step()
        const start = clamp(Math.floor((sx0 - margin.left) / step), 0, hours.length - 1)
        const end = clamp(Math.floor((sx1 - margin.left) / step), 0, hours.length - 1)

        const a = hours[Math.min(start, end)]
        const b = hours[Math.max(start, end)]
        if (a == null || b == null) return
        if (a === b) return
        setTimeRange([a, b])
      })

    const brushG = g.append('g').attr('class', 'brush').call(brush)

    brushG
      .selectAll<SVGRectElement, unknown>('.selection')
      .attr('fill', 'rgba(59,130,246,0.15)')
      .attr('stroke', '#3b82f6')

    brushG.selectAll<SVGRectElement, unknown>('.handle').attr('fill', '#3b82f6')

    if (timeRange) {
      const x0 = x(timeRange[0])
      const x1 = x(timeRange[1])
      if (x0 != null && x1 != null) {
        brushG.call(brush.move as any, [x0, x1 + x.bandwidth()])
      }
    }
  }, [bins, height, setTimeRange, timeRange, width])

  return (
    <div
      className="h-full w-full rounded-lg border border-slate-300 bg-white shadow-sm"
      ref={wrapRef}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
          Timeline
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-slate-500">Nov 9-11 2008 · 38h window</div>
          <button
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
            onClick={() => setTimeRange(null)}
          >
            clear brush
          </button>
        </div>
      </div>

      <div className="p-3">
        {props.isLoading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : (
          <svg ref={svgRef} className="h-[120px] w-full" />
        )}
      </div>
    </div>
  )
}

