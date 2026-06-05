import type { ReactNode } from 'react'

import { Header } from './Header'

type LayoutProps = {
  flaggedCount: number
  sessionCount: number
  timeline: ReactNode
  scatter: ReactNode
  detail: ReactNode
}

export function Layout(props: LayoutProps) {
  return (
    <div className="h-screen w-screen bg-slate-50 overflow-hidden flex flex-col p-4 text-[#0f172a]">
      <div className="flex-shrink-0">
        <Header flaggedCount={props.flaggedCount} sessionCount={props.sessionCount} />
      </div>

      <div className="flex-1 overflow-hidden flex gap-4 min-h-0 pt-4">
        <div className="flex flex-col h-full w-[40%] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-w-0">
          <div className="flex-shrink-0 h-[180px] p-3 border-b border-slate-100 overflow-hidden">
            {props.timeline}
          </div>
          <div className="flex-1 min-h-0 p-3 overflow-hidden">
            {props.scatter}
          </div>
        </div>

        <div className="flex flex-col h-full flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-0 min-w-0">
          {props.detail}
        </div>
      </div>
    </div>
  )
}

