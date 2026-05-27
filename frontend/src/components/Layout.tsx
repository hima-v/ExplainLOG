import type { ReactNode } from 'react'

import { Header } from './Header'

type LayoutProps = {
  flaggedCount: number
  sessionCount: number
  timeline: ReactNode
  scatter: ReactNode
  table: ReactNode
  explain: ReactNode
}

export function Layout(props: LayoutProps) {
  // CSS grid is the least cursed way to do "dashboard tiles" —
  // flexbox can do it, but then you're negotiating with min-heights for hours
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f8fafc] text-[#0f172a]">
      <div className="grid h-full grid-rows-[60px_130px_1fr]">
        <Header flaggedCount={props.flaggedCount} sessionCount={props.sessionCount} />

        <div className="p-3">{props.timeline}</div>

        <div className="grid min-h-0 grid-cols-[65%_35%]">
          <div className="min-h-0 p-3">{props.scatter}</div>

          <div className="grid min-h-0 grid-rows-[55%_45%] p-3 gap-3">
            <div className="min-h-0">{props.table}</div>
            <div className="min-h-0">{props.explain}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

