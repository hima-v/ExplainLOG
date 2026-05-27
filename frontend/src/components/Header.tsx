type HeaderProps = {
  flaggedCount: number
  sessionCount: number
}

export function Header(props: HeaderProps) {
  const windowLabel = 'Nov 9-11 2008 · 38h window'

  return (
    <header className="h-[60px] px-4 flex items-center justify-between bg-white border-b border-slate-200 shadow-sm">
      <div className="flex items-baseline gap-3">
        <div className="text-slate-900 font-semibold tracking-wide">ExplainLOG</div>
        <div className="text-slate-500 text-sm">HDFS Anomaly Triage</div>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-slate-500 text-sm">{windowLabel}</div>
        <div className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-600">
          {props.flaggedCount.toLocaleString()} anomalies
        </div>
        <div className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs text-green-600">
          {props.sessionCount.toLocaleString()} sessions
        </div>
        <div className="text-slate-500 text-sm">LSTM 90% · IForest 10%</div>
      </div>
    </header>
  )
}

