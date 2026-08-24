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
import { externalAmount, formatMonth, formatYen, savingsAmount, sumNullable } from './lib/metrics'
import vendorPriceComparison from '../config/vendor-price-comparison.json'
import type { DashboardData, DashboardView, DateBasis, MajorType, MonthlyAggregate, OutsourcePriceSource } from './types'

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

const BASIS_LABELS: Record<DateBasis, string> = {
  date: '登録日ベース',
  setDate: 'セット日ベース（予定を含む）',
}

const OUTSOURCE_PRICE_LABELS: Record<OutsourcePriceSource, string> = {
  narita: '成田デンタル',
  toyoDental: '東洋デンタル',
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

function buildAmountRows(rows: MonthlyAggregate[], priceSource: OutsourcePriceSource): AmountChartRow[] {
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
    const external = externalAmount(row, priceSource)
    if (external !== null && row.internalCost !== null) {
      target.internal += row.internalCost
      target.external += external
      target.savings += external - row.internalCost
    }
  }
  return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month))
}

interface VendorPriceItem {
  category: string
  product: string
  narita: number | null
  toyoDental: number | null
}

const vendorItems = vendorPriceComparison.items as VendorPriceItem[]

function vendorMinimum(item: VendorPriceItem) {
  const values = [item.narita, item.toyoDental].filter((value): value is number => value !== null)
  return values.length ? Math.min(...values) : null
}

function comparisonResult(item: VendorPriceItem) {
  if (item.narita === null && item.toyoDental === null) return '両社未設定'
  if (item.narita === null) return '東洋デンタルのみ設定'
  if (item.toyoDental === null) return '成田デンタルのみ設定'
  const difference = item.narita - item.toyoDental
  if (difference === 0) return '同額'
  if (difference < 0) return `成田デンタルが${numberFormat.format(Math.abs(difference))}円安い`
  return `東洋デンタルが${numberFormat.format(difference)}円安い`
}

function PriceComparison() {
  const naritaPriced = vendorItems.filter((item) => item.narita !== null).length
  const toyoPriced = vendorItems.filter((item) => item.toyoDental !== null).length
  const chartRows = vendorItems.map((item) => ({
    ...item,
    label: `${item.category.replace('CAD/CAM', 'CAD')} ${item.product}`,
  }))

  return (
    <>
      <section className="comparison-intro">
        <div>
          <p className="section-kicker">OUTSOURCE PRICE BENCHMARK</p>
          <h2>外注単価比較</h2>
          <p>実績再計算に使用する成田デンタル・東洋デンタルの料金を品目別に比較します。</p>
        </div>
        <span className="version-badge">単価基準 {vendorPriceComparison.version}</span>
      </section>

      <section className="comparison-kpi-grid" aria-label="単価比較サマリー">
        <Card label="比較対象" value={`${vendorItems.length}品目`} note="CAD/CAM冠・インレー・アンレー、ジルコニア" />
        <Card label="成田デンタル単価設定" value={`${naritaPriced}品目`} note="未提示の単価は未設定" tone="green" />
        <Card label="東洋デンタル単価設定" value={`${toyoPriced}品目`} note="未提示の単価は未設定" tone="blue" />
      </section>

      <section className="chart-card chart-card--wide">
        <div className="section-heading">
          <div>
            <p className="section-kicker">PRICE BY PRODUCT</p>
            <h2>品目別 外注単価</h2>
          </div>
          <p>未提示の単価は表示していません</p>
        </div>
        <ResponsiveContainer width="100%" height={390}>
          <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 22, left: 72, bottom: 0 }} accessibilityLayer>
            <CartesianGrid stroke="#e8edf4" horizontal={false} />
            <XAxis type="number" tickFormatter={(value) => `${numberFormat.format(Number(value))}円`} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value, name) => [formatYen(Number(value)), String(name)]} />
            <Legend />
            <Bar name="成田デンタル" dataKey="narita" fill="#0f766e" radius={[0, 4, 4, 0]} />
            <Bar name="東洋デンタル" dataKey="toyoDental" fill="#f59e0b" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="table-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">PRICE DETAIL</p>
            <h2>比較単価一覧</h2>
          </div>
          <p>税込・連結料等の条件は各社へ要確認</p>
        </div>
        <div className="table-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>品目</th>
                <th>部位・種類</th>
                <th className="numeric">成田デンタル</th>
                <th className="numeric">東洋デンタル</th>
                <th>比較結果</th>
              </tr>
            </thead>
            <tbody>
              {vendorItems.map((item) => {
                const minimum = vendorMinimum(item)
                return (
                  <tr key={`${item.category}-${item.product}`}>
                    <td>{item.category}</td>
                    <td>{item.product}</td>
                    <td className={minimum !== null && item.narita === minimum ? 'numeric best-price' : 'numeric'}>{formatYen(item.narita)}</td>
                    <td className={minimum !== null && item.toyoDental === minimum ? 'numeric best-price' : 'numeric'}>{formatYen(item.toyoDental)}</td>
                    <td><span className="comparison-result">{comparisonResult(item)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="source-notes" aria-label="単価比較の注記">
        <strong>比較データの注意</strong>
        <ul>{vendorPriceComparison.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      </section>
    </>
  )
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
  const [view, setView] = useState<DashboardView>('performance')
  const [basis, setBasis] = useState<DateBasis>('date')
  const [priceSource, setPriceSource] = useState<OutsourcePriceSource>('narita')
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
  const amountRows = useMemo(() => buildAmountRows(filteredRows, priceSource), [filteredRows, priceSource])

  const typeRows = useMemo(() => {
    const grouped = new Map<string, { detailType: string; majorType: MajorType; units: number; amount: number }>()
    for (const row of focusedRows) {
      if (!grouped.has(row.detailType)) {
        grouped.set(row.detailType, { detailType: row.detailType, majorType: row.majorType, units: 0, amount: 0 })
      }
      const target = grouped.get(row.detailType)!
      target.units += row.units
      target.amount += savingsAmount(row, priceSource) ?? 0
    }
    return [...grouped.values()].sort((a, b) => b.units - a.units).slice(0, 10)
  }, [focusedRows, priceSource])

  const totals = useMemo(() => {
    const units = focusedRows.reduce((sum, row) => sum + row.units, 0)
    const pricedUnits = focusedRows.reduce((sum, row) => sum + (externalAmount(row, priceSource) === null ? 0 : row.units), 0)
    const internalPricedUnits = focusedRows.reduce((sum, row) => sum + (row.internalCost === null ? 0 : row.units), 0)
    const internal = sumNullable(focusedRows.map((row) => row.internalCost))
    const comparisonInternal = sumNullable(focusedRows.map((row) => externalAmount(row, priceSource) === null ? null : row.internalCost))
    const external = sumNullable(focusedRows.map((row) => externalAmount(row, priceSource)))
    const savings = sumNullable(focusedRows.map((row) => savingsAmount(row, priceSource)))
    const savingsRate = external && savings !== null ? Math.round((savings / external) * 1000) / 10 : null
    return { units, pricedUnits, internalPricedUnits, internal, comparisonInternal, external, savings, savingsRate }
  }, [focusedRows, priceSource])

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
    setPriceSource('narita')
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
  const internalUnpricedUnits = totals.units - totals.internalPricedUnits

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">DENTAL LAB PERFORMANCE</p>
          <h1>院内補綴制作ダッシュボード</h1>
          <p className="header-copy">制作本数と院内制作による費用効果を月・種類別に確認し、外注単価を比較します。</p>
        </div>
        <div className="header-meta">
          <span className="status-dot" />
          <div>
            <strong>データ更新</strong>
            <span>{new Date(data.meta.generatedAt).toLocaleString('ja-JP')}</span>
          </div>
        </div>
      </header>

      <nav className="view-tabs" aria-label="ダッシュボード表示">
        <button
          type="button"
          aria-current={view === 'performance' ? 'page' : undefined}
          onClick={() => setView('performance')}
        >
          実績ダッシュボード
        </button>
        <button
          type="button"
          aria-current={view === 'priceComparison' ? 'page' : undefined}
          onClick={() => setView('priceComparison')}
        >
          外注単価比較
        </button>
      </nav>

      {view === 'performance' ? (
        <>

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
        <fieldset className="filter-field filter-field--price-source">
          <legend>外注価格</legend>
          <div className="segmented segmented--vendor">
            {(['narita', 'toyoDental'] as OutsourcePriceSource[]).map((source) => (
              <button
                key={source}
                type="button"
                aria-pressed={priceSource === source}
                onClick={() => setPriceSource(source)}
              >
                {OUTSOURCE_PRICE_LABELS[source]}
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
          note={internalUnpricedUnits ? `院内原価未設定 ${internalUnpricedUnits}本を除外` : '材料費＋労務費の標準原価'}
          tone="blue"
        />
        <Card
          label={`外注相当額（${OUTSOURCE_PRICE_LABELS[priceSource]}）`}
          value={formatYen(totals.external)}
          note={unpricedUnits ? `単価未設定 ${unpricedUnits}本を除外` : '品目別の外注単価で再計算'}
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
                <span className="scenario-badge">{OUTSOURCE_PRICE_LABELS[priceSource]}</span>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={amountRows} margin={{ top: 12, right: 4, left: 4, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid stroke="#e8edf4" vertical={false} />
                  <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10_000)}万`} tickLine={false} axisLine={false} width={54} />
                  <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.month ? formatMonth(payload[0].payload.month) : ''} formatter={(value, name) => [formatYen(Number(value ?? 0)), String(name)]} />
                  <Legend />
                  <Bar name="比較対象院内原価" dataKey="internal" fill="#94a3b8" radius={[3, 3, 0, 0]} />
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
                    <th className="numeric">比較対象院内原価</th>
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
                        <td className="numeric">{formatYen(externalAmount(row, priceSource) === null ? null : row.internalCost)}</td>
                        <td className="numeric">{formatYen(externalAmount(row, priceSource))}</td>
                        <td className="numeric savings-cell">{formatYen(savingsAmount(row, priceSource))}</td>
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
                    <td className="numeric">{formatYen(totals.comparisonInternal)}</td>
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
        </>
      ) : (
        <PriceComparison />
      )}

      <footer>
        {view === 'performance' ? (
          <>
            <p>集計基準日 {data.meta.asOf} ／ 価格マスター {data.meta.priceMasterVersion} ／ 実績金額は概算です</p>
            <p>院内原価には設備償却・再製作・管理費を含みません。</p>
          </>
        ) : (
          <>
            <p>比較単価マスター {vendorPriceComparison.version}</p>
            <p>消費税・連結料・ブロック条件・再製作条件は各社へ確認してください。</p>
          </>
        )}
      </footer>
    </div>
  )
}

export default App
