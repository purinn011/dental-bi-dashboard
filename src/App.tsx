import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { externalAmount, formatCompactYen, formatMonth, formatYen, savingsAmount, sumNullable } from './lib/metrics'
import type { DashboardData, DateBasis, MajorType, MonthlyAggregate, Scenario } from './types'

const COLORS: Record<MajorType, string> = {
  CAD: '#2563eb',
  Zr: '#0f766e',
  Other: '#6b7280',
}

const TYPE_LABELS: Record<MajorType, string> = {
  CAD: 'CAD',
  Zr: 'Zr',
  Other: 'その他',
}

const SCENARIO_LABELS: Record<Scenario, string> = {
  low: '保守',
  mid: '標準',
  high: '上限',
}

const BASIS_LABELS: Record<DateBasis, string> = {
  date: '登録日ベース',
  setDate: 'セット日ベース（予定を含む）',
}

const numberFormat = new Intl.NumberFormat('ja-JP')

interface MonthChartRow {
  month: string
  monthLabel: string
  CAD: number
  Zr: number
  Other: number
  total: number
  isPartialMonth: boolean
  isFutureMonth: boolean
}

interface AmountChartRow {
  month: string
  monthLabel: string
  internal: number
  external: number
  savings: number
}

function buildMonthRows(rows: MonthlyAggregate[]): MonthChartRow[] {
  const grouped = new Map<string, MonthChartRow>()
  for (const row of rows) {
    if (!grouped.has(row.month)) {
      grouped.set(row.month, {
        month: row.month,
        monthLabel: `${Number(row.month.slice(5))}月`,
        CAD: 0,
        Zr: 0,
        Other: 0,
        total: 0,
        isPartialMonth: row.isPartialMonth,
        isFutureMonth: row.isFutureMonth,
      })
    }
    const target = grouped.get(row.month)!
    target[row.majorType] += row.units
    target.total += row.units
    target.isPartialMonth ||= row.isPartialMonth
    target.isFutureMonth ||= row.isFutureMonth
  }
  return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month))
}

function buildAmountRows(rows: MonthlyAggregate[], scenario: Scenario): AmountChartRow[] {
  const grouped = new Map<string, AmountChartRow>()
  for (const row of rows) {
    if (!grouped.has(row.month)) {
      grouped.set(row.month, {
        month: row.month,
        monthLabel: `${Number(row.month.slice(5))}月`,
        internal: 0,
        external: 0,
        savings: 0,
      })
    }
    const target = grouped.get(row.month)!
    target.internal += row.internalCost ?? 0
    target.external += externalAmount(row, scenario) ?? 0
    target.savings += savingsAmount(row, scenario) ?? 0
  }
  return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month))
}

function getRangeMonths(months: string[], range: string) {
  if (range === 'all') return new Set(months)
  if (range === 'last12') return new Set(months.slice(-12))
  return new Set(months.filter((month) => month.startsWith(range)))
}

function Card({ label, value, note, tone = 'default' }: {
  label: string
  value: string
  note: string
  tone?: 'default' | 'blue' | 'green'
}) {
  return (
    <article className={`kpi-card kpi-card--${tone}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      <p className="kpi-note">{note}</p>
    </article>
  )
}

function LoadingState() {
  return (
    <main className="state-page" aria-busy="true">
      <div className="loader" />
      <p>集計データを読み込んでいます…</p>
    </main>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="state-page">
      <div className="state-icon">!</div>
      <h1>データを読み込めませんでした</h1>
      <p>{message}</p>
      <button type="button" onClick={() => window.location.reload()}>再読み込み</button>
    </main>
  )
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [basis, setBasis] = useState<DateBasis>('date')
  const [scenario, setScenario] = useState<Scenario>('mid')
  const [range, setRange] = useState('last12')
  const [majorTypes, setMajorTypes] = useState<Set<MajorType>>(new Set(['CAD', 'Zr', 'Other']))
  const [detailType, setDetailType] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/dashboard.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((value: DashboardData) => setData(value))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : '不明なエラー'))
  }, [])

  const basisRows = useMemo(() => data?.monthly.filter((row) => row.dateBasis === basis) ?? [], [data, basis])
  const months = useMemo(() => [...new Set(basisRows.map((row) => row.month))].sort(), [basisRows])
  const years = useMemo(() => [...new Set(months.map((month) => month.slice(0, 4)))], [months])
  const rangeMonths = useMemo(() => getRangeMonths(months, range), [months, range])
  const detailOptions = useMemo(() => [...new Set(
    basisRows.filter((row) => majorTypes.has(row.majorType)).map((row) => row.detailType),
  )].sort(), [basisRows, majorTypes])

  const filteredRows = useMemo(() => basisRows.filter((row) =>
    rangeMonths.has(row.month) &&
    majorTypes.has(row.majorType) &&
    (detailType === 'all' || row.detailType === detailType)
  ), [basisRows, rangeMonths, majorTypes, detailType])

  const focusedRows = useMemo(() => selectedMonth
    ? filteredRows.filter((row) => row.month === selectedMonth)
    : filteredRows,
  [filteredRows, selectedMonth])

  const monthRows = useMemo(() => buildMonthRows(filteredRows), [filteredRows])
  const amountRows = useMemo(() => buildAmountRows(filteredRows, scenario), [filteredRows, scenario])

  const typeRows = useMemo(() => {
    const grouped = new Map<string, { detailType: string; majorType: MajorType; units: number; amount: number }>()
    for (const row of focusedRows) {
      if (!grouped.has(row.detailType)) {
        grouped.set(row.detailType, { detailType: row.detailType, majorType: row.majorType, units: 0, amount: 0 })
      }
      const target = grouped.get(row.detailType)!
      target.units += row.units
      target.amount += savingsAmount(row, scenario) ?? 0
    }
    return [...grouped.values()].sort((a, b) => b.units - a.units).slice(0, 10)
  }, [focusedRows, scenario])

  const totals = useMemo(() => {
    const units = focusedRows.reduce((sum, row) => sum + row.units, 0)
    const pricedUnits = focusedRows.reduce((sum, row) => sum + (row.internalCost === null ? 0 : row.units), 0)
    const internal = sumNullable(focusedRows.map((row) => row.internalCost))
    const external = sumNullable(focusedRows.map((row) => externalAmount(row, scenario)))
    const savings = sumNullable(focusedRows.map((row) => savingsAmount(row, scenario)))
    const externalLow = sumNullable(focusedRows.map((row) => row.externalLow))
    const externalHigh = sumNullable(focusedRows.map((row) => row.externalHigh))
    const savingsRate = external && savings !== null ? Math.round((savings / external) * 1000) / 10 : null
    return { units, pricedUnits, internal, external, savings, externalLow, externalHigh, savingsRate }
  }, [focusedRows, scenario])

  function toggleMajor(type: MajorType) {
    setMajorTypes((current) => {
      const next = new Set(current)
      if (next.has(type) && next.size > 1) next.delete(type)
      else next.add(type)
      return next
    })
    setDetailType('all')
  }

  function resetFilters() {
    setBasis('date')
    setScenario('mid')
    setRange('last12')
    setMajorTypes(new Set(['CAD', 'Zr', 'Other']))
    setDetailType('all')
    setSelectedMonth(null)
  }

  if (error) return <ErrorState message={error} />
  if (!data) return <LoadingState />

  const latestMonth = monthRows.at(-1)
  const statusText = selectedMonth
    ? `${formatMonth(selectedMonth)}を選択中`
    : `${monthRows.length}か月を表示`
  const unpricedUnits = totals.units - totals.pricedUnits

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">DENTAL LAB PERFORMANCE</p>
          <h1>院内補綴制作ダッシュボード</h1>
          <p className="header-copy">制作本数と院内制作による費用効果を、月・種類・価格シナリオで確認します。</p>
        </div>
        <div className="header-meta">
          <span className="status-dot" />
          <div>
            <strong>データ更新</strong>
            <span>{new Date(data.meta.generatedAt).toLocaleString('ja-JP')}</span>
          </div>
        </div>
      </header>

      <section className="quality-banner" aria-label="データ品質情報">
        <div className="quality-mark">i</div>
        <div>
          <strong>{data.meta.acceptedRows.toLocaleString()}行を採用、{data.meta.reviewRows}行は要確認として除外</strong>
          <p>公開データは匿名集計済みです。{BASIS_LABELS[basis]}・{statusText}。{basis === 'setDate' ? '未来のセット予定を含みます。' : '当月は月途中です。'}</p>
        </div>
      </section>

      <section className="filter-panel" aria-label="表示条件">
        <div className="filter-field">
          <label htmlFor="basis">日付基準</label>
          <select id="basis" value={basis} onChange={(event) => { setBasis(event.target.value as DateBasis); setSelectedMonth(null) }}>
            <option value="date">登録日ベース</option>
            <option value="setDate">セット日ベース（予定含む）</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="range">対象期間</label>
          <select id="range" value={range} onChange={(event) => { setRange(event.target.value); setSelectedMonth(null) }}>
            <option value="last12">直近12か月</option>
            <option value="all">全期間</option>
            {years.map((year) => <option key={year} value={year}>{year}年</option>)}
          </select>
        </div>
        <fieldset className="filter-field filter-field--types">
          <legend>大分類</legend>
          <div className="type-toggles">
            {(['CAD', 'Zr', 'Other'] as MajorType[]).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={majorTypes.has(type)}
                className={majorTypes.has(type) ? 'type-toggle is-active' : 'type-toggle'}
                style={{ '--type-color': COLORS[type] } as React.CSSProperties}
                onClick={() => toggleMajor(type)}
              >
                <span />{TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="filter-field filter-field--detail">
          <label htmlFor="detailType">詳細種類</label>
          <select id="detailType" value={detailType} onChange={(event) => setDetailType(event.target.value)}>
            <option value="all">すべて</option>
            {detailOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <fieldset className="filter-field filter-field--scenario">
          <legend>外注価格</legend>
          <div className="segmented">
            {(['low', 'mid', 'high'] as Scenario[]).map((value) => (
              <button key={value} type="button" aria-pressed={scenario === value} onClick={() => setScenario(value)}>
                {SCENARIO_LABELS[value]}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="reset-button" type="button" onClick={resetFilters}>条件をリセット</button>
      </section>

      {selectedMonth && (
        <div className="selection-banner">
          <span>{formatMonth(selectedMonth)}でKPI・種類別・詳細表を絞り込み中</span>
          <button type="button" onClick={() => setSelectedMonth(null)}>月選択を解除</button>
        </div>
      )}

      <section className="kpi-grid" aria-label="主要指標">
        <Card
          label="制作実績"
          value={`${numberFormat.format(totals.units)}本`}
          note={latestMonth?.isPartialMonth ? '最新月は月途中' : `${totals.pricedUnits}本が金額算定対象`}
        />
        <Card
          label="院内原価実績"
          value={formatYen(totals.internal)}
          note={unpricedUnits ? `価格未設定 ${unpricedUnits}本を除外` : '材料費＋労務費の標準原価'}
          tone="blue"
        />
        <Card
          label={`外注相当額（${SCENARIO_LABELS[scenario]}）`}
          value={formatYen(totals.external)}
          note={`${formatYen(totals.externalLow)} 〜 ${formatYen(totals.externalHigh)}`}
        />
        <Card
          label="推定削減額"
          value={formatYen(totals.savings)}
          note={totals.savingsRate === null ? '算定不可' : `外注相当額比 ${totals.savingsRate}%`}
          tone="green"
        />
      </section>

      {filteredRows.length === 0 ? (
        <section className="empty-card">
          <h2>条件に一致するデータがありません</h2>
          <p>期間または種類の条件を変更してください。</p>
          <button type="button" onClick={resetFilters}>条件をリセット</button>
        </section>
      ) : (
        <>
          <section className="chart-card chart-card--wide">
            <div className="section-heading">
              <div>
                <p className="section-kicker">VOLUME TREND</p>
                <h2>月別・種類別 制作本数</h2>
              </div>
              <p>棒を選択すると他の指標を月で絞り込みます</p>
            </div>
            <div className="chart-wrap" role="img" aria-label="月別にCAD、Zr、その他の制作本数を積み上げ棒で表示">
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={monthRows} margin={{ top: 18, right: 8, left: -12, bottom: 0 }} onClick={(event: any) => event?.activeLabel && setSelectedMonth(event.activeLabel)} accessibilityLayer>
                  <CartesianGrid stroke="#e8edf4" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(value) => `${Number(String(value).slice(5))}月`} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={(value) => formatMonth(String(value))} formatter={(value, name) => [`${numberFormat.format(Number(value ?? 0))}本`, TYPE_LABELS[name as MajorType] ?? String(name)]} />
                  <Legend formatter={(value) => TYPE_LABELS[value as MajorType] ?? value} />
                  <Bar dataKey="CAD" stackId="units" fill={COLORS.CAD} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Zr" stackId="units" fill={COLORS.Zr} />
                  <Bar dataKey="Other" stackId="units" fill={COLORS.Other} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="chart-grid">
            <section className="chart-card">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">COST IMPACT</p>
                  <h2>月別 金額推移</h2>
                </div>
                <span className="scenario-badge">{SCENARIO_LABELS[scenario]}</span>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={amountRows} margin={{ top: 12, right: 4, left: 4, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid stroke="#e8edf4" vertical={false} />
                  <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10_000)}万`} tickLine={false} axisLine={false} width={54} />
                  <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.month ? formatMonth(payload[0].payload.month) : ''} formatter={(value, name) => [formatYen(Number(value ?? 0)), String(name)]} />
                  <Legend />
                  <Bar name="院内原価" dataKey="internal" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                  <Bar name="外注相当額" dataKey="external" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                  <Bar name="推定削減額" dataKey="savings" fill="#16a34a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="chart-card">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">TYPE MIX</p>
                  <h2>詳細種類別 本数</h2>
                </div>
                <p>上位10種類</p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={typeRows} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid stroke="#e8edf4" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="detailType" width={144} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${numberFormat.format(Number(value ?? 0))}本`, '制作本数']} />
                  <Bar dataKey="units" radius={[0, 5, 5, 0]}>
                    {typeRows.map((row) => <Cell key={row.detailType} fill={COLORS[row.majorType]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>

          <section className="table-card">
            <div className="section-heading">
              <div>
                <p className="section-kicker">DETAIL</p>
                <h2>月・種類別 実績明細</h2>
              </div>
              <p>{focusedRows.length}行</p>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>月</th>
                    <th>大分類</th>
                    <th>詳細種類</th>
                    <th className="numeric">本数</th>
                    <th className="numeric">院内原価</th>
                    <th className="numeric">外注相当額</th>
                    <th className="numeric">推定削減額</th>
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {[...focusedRows]
                    .sort((a, b) => b.month.localeCompare(a.month) || b.units - a.units)
                    .map((row) => (
                      <tr key={`${row.month}-${row.dateBasis}-${row.detailType}`}>
                        <td>{formatMonth(row.month)}</td>
                        <td><span className="type-pill" style={{ '--pill-color': COLORS[row.majorType] } as React.CSSProperties}>{TYPE_LABELS[row.majorType]}</span></td>
                        <td>{row.detailType}</td>
                        <td className="numeric">{numberFormat.format(row.units)}本</td>
                        <td className="numeric">{formatYen(row.internalCost)}</td>
                        <td className="numeric">{formatYen(externalAmount(row, scenario))}</td>
                        <td className="numeric savings-cell">{formatYen(savingsAmount(row, scenario))}</td>
                        <td>
                          {row.isFutureMonth ? <span className="status status--future">予定</span> : row.isPartialMonth ? <span className="status status--partial">月途中</span> : <span className="status">確定月</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>選択条件 合計</th>
                    <td className="numeric">{numberFormat.format(totals.units)}本</td>
                    <td className="numeric">{formatYen(totals.internal)}</td>
                    <td className="numeric">{formatYen(totals.external)}</td>
                    <td className="numeric savings-cell">{formatYen(totals.savings)}</td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      <footer>
        <p>集計基準日 {data.meta.asOf} ／ 価格マスター {data.meta.priceMasterVersion} ／ 実績金額は概算です</p>
        <p>院内原価には設備償却・再製作・管理費を含みません。</p>
      </footer>
    </div>
  )
}

export default App
