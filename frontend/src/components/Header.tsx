type HeaderProps = {
  flaggedCount: number
  sessionCount: number
}

export function Header(props: HeaderProps) {
  const windowLabel = 'Nov 9-11 2008 · 38h window'

  return (
    <header className="h-[52px] bg-white border-b border-slate-200">
      <div className="h-full px-3 grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="min-w-0">
          <div className="font-semibold tracking-wide text-slate-900 whitespace-nowrap">
            ExplainLOG <span className="text-slate-400 font-medium">—</span>{' '}
            <span className="font-semibold text-slate-900">HDFS Anomaly Triage</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs whitespace-nowrap">
          <span className="tabular-nums text-red-600">
            {props.flaggedCount.toLocaleString()} anomalies
          </span>
          <span className="text-slate-300">|</span>
          <span className="tabular-nums text-green-600">
            {props.sessionCount.toLocaleString()} sessions
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">{windowLabel}</span>
        </div>

        <div />
      </div>
    </header>
  )
}

