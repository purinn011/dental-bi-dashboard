import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { externalAmount, formatMonth, formatYen, savingsAmount, sumNullable } from './lib/metrics'
import vendorPriceComparison from '../config/vendor-price-comparison.json'
import type { DashboardData, DashboardView, DateBasis, MajorType, MonthlyAggregate, OutsourcePriceSource, RetainerData } from './types'

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
const DASHBOARD_DATA_VERSION = '2026-08-26.4'
const RETAINER_DATA_VERSION = '2026-08-28.1'

function calendarYearFromMonth(month: string) {
  return Number(month.slice(0, 4))
}

function calendarYearLabel(year: number) {
  return `${year}年（1〜12月）`
}

function axisMonthLabel(month: string) {
  return `${Number(month.slice(5, 7))}月`
}

function formatNumberRange(min: number | null, max: number | null, suffix: string) {
  if (min === null || max === null) return '算定対象なし'
  if (min === max) return `${numberFormat.format(min)}${suffix}`
  return `${numberFormat.format(min)}〜${numberFormat.format(max)}${suffix}`
}

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

function monthsForCalendarRange(range: string) {
  if (!range.startsWith('year:')) return []
  const year = range.slice(5)
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
}

function buildMonthRows(rows: MonthlyAggregate[], visibleMonths: string[], asOf: string): MonthChartRow[] {
  const grouped = new Map<string, MonthChartRow>()
  const asOfMonth = asOf.slice(0, 7)
  for (const month of visibleMonths) {
    grouped.set(month, {
      month,
      monthLabel: axisMonthLabel(month),
      CAD: 0,
      Zr: 0,
      Other: 0,
      total: 0,
      isPartialMonth: month === asOfMonth,
      isFutureMonth: month > asOfMonth,
    })
  }
  for (const row of rows) {
    if (!grouped.has(row.month)) {
      grouped.set(row.month, {
        month: row.month,
        monthLabel: axisMonthLabel(row.month),
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

function buildAmountRows(rows: MonthlyAggregate[], priceSource: OutsourcePriceSource, visibleMonths: string[]): AmountChartRow[] {
  const grouped = new Map<string, AmountChartRow>()
  for (const month of visibleMonths) {
    grouped.set(month, {
      month,
      monthLabel: axisMonthLabel(month),
      internal: 0,
      external: 0,
      savings: 0,
    })
  }
  for (const row of rows) {
    if (!grouped.has(row.month)) {
      grouped.set(row.month, {
        month: row.month,
        monthLabel: axisMonthLabel(row.month),
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
        <Card label="比較対象" value={`${vendorItems.length}品目`} note="CAD/CAM、ジルコニア、e.max" />
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

function InsuranceDashboard({ data, basis, onBasisChange }: {
  data: DashboardData
  basis: DateBasis
  onBasisChange: (basis: DateBasis) => void
}) {
  const defaultYear = calendarYearFromMonth(data.insuranceMaster.effectiveFrom)
  const [insuranceRange, setInsuranceRange] = useState(`year:${defaultYear}`)
  const basisRows = useMemo(
    () => data.monthly.filter((row) => row.dateBasis === basis),
    [data, basis],
  )
  const months = useMemo(() => [...new Set(basisRows.map((row) => row.month))].sort(), [basisRows])
  const calendarYears = useMemo(
    () => [...new Set(months.map(calendarYearFromMonth))].sort((a, b) => a - b),
    [months],
  )
  const rangeMonths = useMemo(() => getRangeMonths(months, insuranceRange), [months, insuranceRange])
  const periodRows = useMemo(
    () => basisRows.filter((row) => rangeMonths.has(row.month)),
    [basisRows, rangeMonths],
  )
  const rows = useMemo(
    () => periodRows.filter((row) => row.insuranceAmountMin !== null && row.insuranceAmountMax !== null),
    [periodRows],
  )
  const totals = useMemo(() => {
    const units = rows.reduce((sum, row) => sum + row.units, 0)
    const pointsMin = rows.reduce((sum, row) => sum + (row.insurancePointsMin ?? 0), 0)
    const pointsMax = rows.reduce((sum, row) => sum + (row.insurancePointsMax ?? 0), 0)
    const amountMin = rows.reduce((sum, row) => sum + (row.insuranceAmountMin ?? 0), 0)
    const amountMax = rows.reduce((sum, row) => sum + (row.insuranceAmountMax ?? 0), 0)
    const internal = rows.reduce((sum, row) => sum + (row.internalCost ?? 0), 0)
    return { units, pointsMin, pointsMax, amountMin, amountMax, internal }
  }, [rows])
  const excludedCadUnits = periodRows.reduce(
    (sum, row) => sum + (row.majorType === 'CAD' && row.insuranceAmountMin === null ? row.units : 0),
    0,
  )

  return (
    <>
      <section className="comparison-intro">
        <div>
          <p className="section-kicker">INSURANCE POINTS & REIMBURSEMENT</p>
          <h2>保険点数・診療報酬</h2>
          <p>月ごとの適用時期を判定し、CAD/CAM冠・インレーの点数と診療報酬額を下限〜上限で再計算します。</p>
        </div>
        <span className="version-badge">{data.insuranceMaster.schedule}・v{data.insuranceMaster.version}</span>
      </section>

      <section className="filter-panel filter-panel--insurance" aria-label="保険点数の表示条件">
        <div className="filter-field">
          <label htmlFor="insuranceBasis">日付基準</label>
          <select id="insuranceBasis" value={basis} onChange={(event) => onBasisChange(event.target.value as DateBasis)}>
            <option value="date">登録日ベース</option>
            <option value="setDate">セット日ベース（予定含む）</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="insuranceRange">対象年</label>
          <select id="insuranceRange" value={insuranceRange} onChange={(event) => setInsuranceRange(event.target.value)}>
            {calendarYears.map((year) => <option key={year} value={`year:${year}`}>{calendarYearLabel(year)}</option>)}
          </select>
        </div>
        <div className="insurance-assumption">
          <strong>算定前提</strong>
          <span>光学印象 {data.insuranceMaster.assumptions.opticalImpression}点／装着材料 {data.insuranceMaster.assumptions.adhesiveMaterial}点／1点={data.insuranceMaster.pointValueYen}円</span>
        </div>
      </section>

      <section className="kpi-grid" aria-label="保険点数サマリー">
        <Card label="保険算定対象" value={`${numberFormat.format(totals.units)}本`} note={excludedCadUnits ? `点数未設定・適用前 ${numberFormat.format(excludedCadUnits)}本を除外` : 'CAD/CAM冠・インレー'} />
        <Card label="保険点数" value={formatNumberRange(totals.units ? totals.pointsMin : null, totals.units ? totals.pointsMax : null, '点')} note="歯髄状態・材料区分による幅" tone="blue" />
        <Card label="診療報酬額" value={formatNumberRange(totals.units ? totals.amountMin : null, totals.units ? totals.amountMax : null, '円')} note="保険点数×10円（患者負担額ではありません）" />
        <Card label="報酬−院内原価" value={formatNumberRange(totals.units ? totals.amountMin - totals.internal : null, totals.units ? totals.amountMax - totals.internal : null, '円')} note="算定対象品目の標準院内原価との差" tone="green" />
      </section>

      {rows.length === 0 && (
        <section className="insurance-period-note">
          選択年の実績には{data.insuranceMaster.schedule}の適用対象月がありません。下の点数表は現行マスターです。
        </section>
      )}

      <section className="table-card insurance-points-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">INSURANCE POINT MASTER</p>
            <h2>CAD/CAM 保険点数表</h2>
          </div>
          <p>1歯あたり・光学印象・装着材料{data.insuranceMaster.assumptions.adhesiveMaterial}点で計算</p>
        </div>
        <div className="table-scroll">
          <table className="insurance-points-table">
            <thead>
              <tr>
                <th>種類</th>
                <th>歯髄状態</th>
                <th>材料区分</th>
                <th className="numeric">形成</th>
                <th className="numeric">CAD形成加算</th>
                <th className="numeric">光学印象</th>
                <th className="numeric">CAD/CAM技術料</th>
                <th className="numeric">装着</th>
                <th className="numeric">内面処理</th>
                <th className="numeric">補管</th>
                <th className="numeric">CAD材料</th>
                <th className="numeric">装着材料</th>
                <th className="numeric total-points">合計点数</th>
                <th className="numeric total-amount">診療報酬額</th>
              </tr>
            </thead>
            <tbody>
              {data.insuranceMaster.pointTable.map((row) => (
                <tr key={`${row.detailType}-${row.pulpStatus}-${row.materialClass}`}>
                  <td className="point-item">{row.detailType}</td>
                  <td>{row.pulpStatus}</td>
                  <td>{row.materialClass}</td>
                  <td className="numeric">{numberFormat.format(row.formation)}</td>
                  <td className="numeric">{numberFormat.format(row.cadFormation)}</td>
                  <td className="numeric">{numberFormat.format(row.opticalImpression)}</td>
                  <td className="numeric">{numberFormat.format(row.cadTechnology)}</td>
                  <td className="numeric">{numberFormat.format(row.placement)}</td>
                  <td className="numeric">{numberFormat.format(row.innerSurface)}</td>
                  <td className="numeric">{numberFormat.format(row.maintenance)}</td>
                  <td className="numeric">{numberFormat.format(row.cadMaterial)}</td>
                  <td className="numeric">{numberFormat.format(row.adhesiveMaterial)}</td>
                  <td className="numeric total-points">{numberFormat.format(row.totalPoints)}点</td>
                  <td className="numeric total-amount">{formatYen(row.totalPoints * data.insuranceMaster.pointValueYen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="source-notes" aria-label="保険点数の注記">
        <strong>算定上の注意</strong>
        <ul>{data.insuranceMaster.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <div className="source-links">
          {data.insuranceMaster.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}
        </div>
      </section>
    </>
  )
}

function RetainerDashboard({ data }: { data: RetainerData }) {
  const years = useMemo(
    () => [...new Set(data.monthlyClinics.map((row) => Number(row.month.slice(0, 4))))].sort((a, b) => a - b),
    [data],
  )
  const [year, setYear] = useState(() => years.at(-1) ?? Number(data.meta.asOf.slice(0, 4)))
  const [clinic, setClinic] = useState('all')
  const rows = useMemo(() => data.monthlyClinics.filter((row) =>
    Number(row.month.slice(0, 4)) === year && (clinic === 'all' || row.clinic === clinic)
  ), [data, year, clinic])

  const totals = useMemo(() => rows.reduce((target, row) => ({
    cases: target.cases + row.cases,
    standardCases: target.standardCases + row.standardCases,
    singleArchCases: target.singleArchCases + row.singleArchCases,
    unknownArchCases: target.unknownArchCases + row.unknownArchCases,
    knownSheets: target.knownSheets + row.knownSheets,
  }), { cases: 0, standardCases: 0, singleArchCases: 0, unknownArchCases: 0, knownSheets: 0 }), [rows])

  const monthRows = useMemo(() => {
    const grouped = new Map(Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, '0')}`
      return [month, { month, monthLabel: `${index + 1}月`, cases: 0, standardCases: 0 }]
    }))
    for (const row of rows) {
      const target = grouped.get(row.month)
      if (!target) continue
      target.cases += row.cases
      target.standardCases += row.standardCases
    }
    return [...grouped.values()]
  }, [rows, year])

  const clinicRows = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const row of rows) grouped.set(row.clinic, (grouped.get(row.clinic) ?? 0) + row.cases)
    const total = [...grouped.values()].reduce((sum, value) => sum + value, 0)
    return [...grouped.entries()].map(([name, cases]) => ({
      clinic: name,
      cases,
      share: total ? Math.round((cases / total) * 1000) / 10 : 0,
    })).sort((a, b) => b.cases - a.cases)
  }, [rows])

  const standardSheets = data.master.setsPerCase * 2 * data.master.sheetsPerArchPerSet
  const routeRows = useMemo(() => {
    const definitions = [
      ['gcOrtho', data.master.routes.gcOrtho, '#2563eb'],
      ['toyoDental', data.master.routes.toyoDental, '#0f766e'],
      ['inHouse', data.master.routes.inHouse, '#7c3aed'],
    ] as const
    return definitions.map(([id, route, color]) => {
      const sheetCost = id === 'gcOrtho' ? 0 : standardSheets * data.master.sheetCost
      const directCost = route.externalCostPerCase + route.modelCostPerCase + sheetCost
      const residual = data.master.salePricePerCase - directCost
      return {
        id,
        route: route.label,
        color,
        directCost,
        residual,
        periodDirectCost: directCost * totals.standardCases,
        periodResidual: residual * totals.standardCases,
      }
    })
  }, [data, standardSheets, totals.standardCases])
  const gcResidual = routeRows.find((row) => row.id === 'gcOrtho')?.residual ?? 0
  const comparisonRevenue = totals.standardCases * data.master.salePricePerCase
  const clinics = ['東松原', '下北沢']
  const imageBase = `${import.meta.env.BASE_URL}assets/retainer/`

  return (
    <>
      <section className="comparison-intro retainer-intro">
        <div>
          <p className="section-kicker">RETAINER ROUTE ECONOMICS</p>
          <h2>リテーナー制作比較</h2>
          <p>4セット症例だけを集計し、GCオルソリー・東洋デンタル・院内制作の直接費を同じ条件で比較します。</p>
        </div>
        <span className="version-badge">原価基準 {data.meta.masterVersion}</span>
      </section>

      <section className="quality-banner" aria-label="リテーナー集計条件">
        <div className="quality-mark">i</div>
        <div>
          <strong>4セット症例のみ集計／金額比較は上下4セットに統一</strong>
          <p>上のみ・下のみと歯列不明は件数に含めますが、3ルートの金額比較から除外します。患者情報は公開データに含みません。</p>
        </div>
      </section>

      <section className="retainer-visual-overview" aria-label="リテーナー制作の概要">
        <figure className="retainer-visual-card retainer-visual-card--product">
          <a href={`${imageBase}retainer-product.webp`} target="_blank" rel="noreferrer">
            <img src={`${imageBase}retainer-product.webp`} alt="透明な歯列用リテーナーの完成イメージ" loading="lazy" />
          </a>
          <figcaption><strong>リテーナー完成イメージ</strong><span>矯正後の歯列を維持するために装着する透明な保定装置です。</span></figcaption>
        </figure>
        <figure className="retainer-visual-card retainer-visual-card--process">
          <a href={`${imageBase}inhouse-forming-process.webp`} target="_blank" rel="noreferrer">
            <img src={`${imageBase}inhouse-forming-process.webp`} alt="院内で歯列模型上にリテーナーを成形している工程" loading="lazy" />
          </a>
          <figcaption><strong>院内制作の工程</strong><span>3Dプリントした歯列模型を使い、シートを成形・トリミングして仕上げます。</span></figcaption>
        </figure>
      </section>

      <section className="filter-panel retainer-filter-panel" aria-label="リテーナー表示条件">
        <div className="filter-field">
          <label htmlFor="retainerYear">対象年</label>
          <select id="retainerYear" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {years.map((value) => <option key={value} value={value}>{calendarYearLabel(value)}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="retainerClinic">医院</label>
          <select id="retainerClinic" value={clinic} onChange={(event) => setClinic(event.target.value)}>
            <option value="all">全医院</option>
            {clinics.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="insurance-assumption">
          <strong>共通前提</strong>
          <span>売価 {formatYen(data.master.salePricePerCase)}／4セット／上下は{standardSheets}枚／シート {formatYen(data.master.sheetCost)}・枚</span>
        </div>
      </section>

      <section className="kpi-grid retainer-kpi-grid" aria-label="リテーナー主要指標">
        <Card label="4セット症例" value={`${numberFormat.format(totals.cases)}件`} note="セット数が4セットの症例" />
        <Card label="上下・比較対象" value={`${numberFormat.format(totals.standardCases)}件`} note={`上のみ ${totals.singleArchCases}件／歯列不明 ${totals.unknownArchCases}件を金額比較から除外`} tone="blue" />
        <Card label="推定制作枚数" value={`${numberFormat.format(totals.knownSheets)}枚`} note="上下8枚、片顎4枚として集計" />
        <Card label="比較対象売上" value={formatYen(comparisonRevenue)} note="上下4セット症例×55,000円" tone="green" />
      </section>

      <section className="chart-card chart-card--wide">
        <div className="section-heading">
          <div>
            <p className="section-kicker">DIRECT COST & RESIDUAL</p>
            <h2>1症例あたり 制作ルート比較</h2>
          </div>
          <span className="scenario-badge">上下4セット・8枚</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={routeRows} layout="vertical" margin={{ top: 8, right: 24, left: 20, bottom: 0 }} accessibilityLayer>
            <CartesianGrid stroke="#e8edf4" horizontal={false} />
            <XAxis type="number" domain={[0, data.master.salePricePerCase]} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}千`} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="route" width={118} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value, name) => [formatYen(Number(value ?? 0)), String(name)]} />
            <Legend />
            <Bar name="直接原価" dataKey="directCost" stackId="sale" fill="#f59e0b" radius={[4, 0, 0, 4]} />
            <Bar name="直接費控除後残額" dataKey="residual" stackId="sale" fill="#16a34a" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="table-card retainer-route-table-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">ROUTE DETAIL</p>
            <h2>制作ルート別 計算内訳</h2>
          </div>
          <p>選択期間の上下4セット {totals.standardCases}件で再計算</p>
        </div>
        <div className="table-scroll">
          <table className="retainer-route-table">
            <thead>
              <tr>
                <th>制作ルート</th>
                <th className="numeric">1症例の直接原価</th>
                <th className="numeric">1症例の残額</th>
                <th className="numeric">GC比改善</th>
                <th className="numeric">期間直接原価</th>
                <th className="numeric">期間残額</th>
              </tr>
            </thead>
            <tbody>
              {routeRows.map((row) => (
                <tr key={row.id}>
                  <td><span className="route-name"><span style={{ background: row.color }} />{row.route}</span></td>
                  <td className="numeric">{formatYen(row.directCost)}</td>
                  <td className="numeric savings-cell">{formatYen(row.residual)}</td>
                  <td className="numeric">{row.id === 'gcOrtho' ? '基準' : `+${formatYen(row.residual - gcResidual)}`}</td>
                  <td className="numeric">{formatYen(row.periodDirectCost)}</td>
                  <td className="numeric savings-cell">{formatYen(row.periodResidual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="decision-line" aria-label="院内制作の判断ライン">
        <div>
          <p className="section-kicker">DECISION THRESHOLD</p>
          <h2>院内制作の判断ラインは1症例あたり1,200円</h2>
          <p>院内制作の人件費・失敗・保守・廃棄・教育負担の合計が1,200円を超える場合、模型を東洋デンタルへ外注する方が実質的に有利です。</p>
        </div>
        <strong>1,200円</strong>
      </section>

      <div className="chart-grid retainer-chart-grid">
        <section className="chart-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">CASE TREND</p>
              <h2>月別 4セット症例数</h2>
            </div>
            <p>{year}年・{clinic === 'all' ? '全医院' : clinic}</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthRows} margin={{ top: 12, right: 4, left: -18, bottom: 0 }} accessibilityLayer>
              <CartesianGrid stroke="#e8edf4" vertical={false} />
              <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value, name) => [`${numberFormat.format(Number(value ?? 0))}件`, String(name)]} />
              <Legend />
              <Bar name="4セット症例" dataKey="cases" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar name="上下・比較対象" dataKey="standardCases" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="chart-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">CLINIC MIX</p>
              <h2>医院別 4セット症例</h2>
            </div>
            <p>東松原／下北沢</p>
          </div>
          {clinicRows.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart accessibilityLayer>
                <Pie data={clinicRows} dataKey="cases" nameKey="clinic" cx="50%" cy="45%" innerRadius={58} outerRadius={92} paddingAngle={2} label>
                  {clinicRows.map((row, index) => <Cell key={row.clinic} fill={index === 0 ? '#2563eb' : '#0f766e'} />)}
                </Pie>
                <Tooltip formatter={(value, _, item) => [`${numberFormat.format(Number(value ?? 0))}件（${item?.payload?.share ?? 0}%）`, '症例数']} />
                <Legend verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="chart-empty">該当する症例がありません</div>}
        </section>
      </div>

      <section className="technical-debt-section">
        <div className="technical-debt-heading">
          <div>
            <p className="section-kicker">TECHNICAL DEBT</p>
            <h2>材料費だけでは見えない院内制作の負担</h2>
          </div>
          <p>技術負債は確定費用ではないため、金額には加算せず判断材料として表示します。</p>
        </div>
        <p className="technical-debt-copy">光造形による院内制作は材料費を抑えられる一方、温度管理、造形条件の調整、洗浄・二次硬化、清掃、廃液処理、機器保守、スタッフ教育が必要です。手順や条件を標準化せず担当者の経験に依存すると、造形失敗、再製作、納期遅延、属人化が繰り返され、将来の作業負担として蓄積します。</p>

        <figure className="debt-figure debt-figure--failure">
          <a href={`${imageBase}printing-failure.webp`} target="_blank" rel="noreferrer">
            <img src={`${imageBase}printing-failure.webp`} alt="サポート破損と造形物の脱落が起きた光造形3Dプリンターの失敗例" loading="lazy" />
          </a>
          <figcaption><strong>造形失敗の実例</strong><span>条件不良やサポート設計の問題は、再印刷、レジン槽の清掃、材料廃棄、納期遅延を発生させます。ロスト額は未定義のため、試算金額には含めません。</span></figcaption>
        </figure>

        <figure className="debt-figure debt-figure--hero">
          <a href={`${imageBase}technical-debt-overview.webp`} target="_blank" rel="noreferrer">
            <img src={`${imageBase}technical-debt-overview.webp`} alt="温度管理、清掃、洗浄、二次硬化、安全、教育といった光造形3Dプリンターの技術的負債" loading="lazy" />
          </a>
          <figcaption>安い材料費の裏側には、温度・後処理・安全・教育を継続管理する負担があります。</figcaption>
        </figure>

        <details className="debt-details">
          <summary>技術負債の詳細画像を見る（3枚）</summary>
          <div className="debt-gallery">
            <figure className="debt-figure">
              <a href={`${imageBase}environment-factors.webp`} target="_blank" rel="noreferrer">
                <img src={`${imageBase}environment-factors.webp`} alt="樹脂温度、直射光、残渣、振動、撹拌、乾燥などの造形環境因子" loading="lazy" />
              </a>
              <figcaption>樹脂温度、紫外線、残渣、振動、撹拌、乾燥条件が造形精度と成功率を左右します。</figcaption>
            </figure>
            <figure className="debt-figure">
              <a href={`${imageBase}debt-cycle.webp`} target="_blank" rel="noreferrer">
                <img src={`${imageBase}debt-cycle.webp`} alt="条件未固定から造形失敗、場当たり調整、寸法誤差、属人化へ進む悪循環" loading="lazy" />
              </a>
              <figcaption>条件未固定のまま場当たり調整を続けると、失敗と属人化が繰り返されます。</figcaption>
            </figure>
            <figure className="debt-figure">
              <a href={`${imageBase}safety-waste.webp`} target="_blank" rel="noreferrer">
                <img src={`${imageBase}safety-waste.webp`} alt="換気、保護具、廃液処理など光造形に必要な安全と廃棄管理" loading="lazy" />
              </a>
              <figcaption>換気、保護具、洗浄液、廃液処理までが院内制作の工程に含まれます。</figcaption>
            </figure>
          </div>
        </details>

        <figure className="debt-figure debt-figure--threshold">
          <a href={`${imageBase}cost-threshold.webp`} target="_blank" rel="noreferrer">
            <img src={`${imageBase}cost-threshold.webp`} alt="東洋デンタルの模型印刷1500円と院内材料費300円の差額1200円を示す比較" loading="lazy" />
          </a>
          <figcaption>差額1,200円を超える隠れコストがあるかどうかが、院内制作の経済性を分けます。</figcaption>
        </figure>
      </section>

      <section className="source-notes" aria-label="リテーナー集計の注記">
        <strong>試算上の注意</strong>
        <ul>{data.master.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <p className="retainer-resin-note">模型用レジン液は1顎100円を原価根拠とし、院内ルートの比較計算では余剰等を含む基準値300円／上下症例を採用しています。</p>
      </section>
    </>
  )
}

function getRangeMonths(months: string[], range: string) {
  if (range.startsWith('year:')) {
    const calendarYear = Number(range.slice(5))
    return new Set(months.filter((month) => calendarYearFromMonth(month) === calendarYear))
  }
  return new Set()
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
  const [retainerData, setRetainerData] = useState<RetainerData | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<DashboardView>('performance')
  const [basis, setBasis] = useState<DateBasis>('date')
  const [priceSource, setPriceSource] = useState<OutsourcePriceSource>('narita')
  const [range, setRange] = useState('year:2026')
  const [majorTypes, setMajorTypes] = useState<Set<MajorType>>(new Set(['CAD', 'Zr', 'Other']))
  const [detailType, setDetailType] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/dashboard.json?v=${DASHBOARD_DATA_VERSION}`),
      fetch(`${import.meta.env.BASE_URL}data/retainer.json?v=${RETAINER_DATA_VERSION}`),
    ])
      .then(async ([dashboardResponse, retainerResponse]) => {
        if (!dashboardResponse.ok) throw new Error(`実績データ HTTP ${dashboardResponse.status}`)
        if (!retainerResponse.ok) throw new Error(`リテーナーデータ HTTP ${retainerResponse.status}`)
        return Promise.all([
          dashboardResponse.json() as Promise<DashboardData>,
          retainerResponse.json() as Promise<RetainerData>,
        ])
      })
      .then(([dashboardValue, retainerValue]) => {
        setData(dashboardValue)
        setRetainerData(retainerValue)
        setRange(`year:${dashboardValue.meta.asOf.slice(0, 4)}`)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : '不明なエラー'))
  }, [])

  const basisRows = useMemo(() => data?.monthly.filter((row) => row.dateBasis === basis) ?? [], [data, basis])
  const months = useMemo(() => [...new Set(basisRows.map((row) => row.month))].sort(), [basisRows])
  const calendarYears = useMemo(
    () => [...new Set(months.map(calendarYearFromMonth))].sort((a, b) => a - b),
    [months],
  )
  const rangeMonths = useMemo(() => getRangeMonths(months, range), [months, range])
  const visibleCalendarMonths = useMemo(() => monthsForCalendarRange(range), [range])
  const detailOptions = useMemo(() => [...new Set(
    basisRows.filter((row) => majorTypes.has(row.majorType)).map((row) => row.detailType),
  )].sort(), [basisRows, majorTypes])

  const filteredRows = useMemo(() => basisRows.filter((row) =>
    rangeMonths.has(row.month) &&
    majorTypes.has(row.majorType) &&
    (detailType === 'all' || row.detailType === detailType)
  ), [basisRows, rangeMonths, majorTypes, detailType])

  const filteredDimensionRows = useMemo(() => data?.productionDimensions.filter((row) =>
    row.dateBasis === basis &&
    rangeMonths.has(row.month) &&
    majorTypes.has(row.majorType) &&
    (detailType === 'all' || row.detailType === detailType) &&
    (!selectedMonth || row.month === selectedMonth)
  ) ?? [], [data, basis, rangeMonths, majorTypes, detailType, selectedMonth])

  const focusedRows = useMemo(() => selectedMonth
    ? filteredRows.filter((row) => row.month === selectedMonth)
    : filteredRows,
  [filteredRows, selectedMonth])

  const monthRows = useMemo(
    () => buildMonthRows(filteredRows, visibleCalendarMonths, data?.meta.asOf ?? ''),
    [filteredRows, visibleCalendarMonths, data],
  )
  const amountRows = useMemo(
    () => buildAmountRows(filteredRows, priceSource, visibleCalendarMonths),
    [filteredRows, priceSource, visibleCalendarMonths],
  )

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

  const clinicRows = useMemo(() => {
    const targetClinics = ['東松原', '下北沢']
    const grouped = new Map(targetClinics.map((clinic) => [clinic, 0]))
    for (const row of filteredDimensionRows) {
      if (grouped.has(row.clinic)) grouped.set(row.clinic, (grouped.get(row.clinic) ?? 0) + row.units)
    }
    const total = [...grouped.values()].reduce((sum, value) => sum + value, 0)
    return targetClinics.map((clinic) => ({
      clinic,
      units: grouped.get(clinic) ?? 0,
      share: total ? Math.round(((grouped.get(clinic) ?? 0) / total) * 1000) / 10 : 0,
    })).filter((row) => row.units > 0)
  }, [filteredDimensionRows])

  const clinicExcludedUnits = useMemo(() => filteredDimensionRows.reduce(
    (sum, row) => sum + (row.clinic === '東松原' || row.clinic === '下北沢' ? 0 : row.units),
    0,
  ), [filteredDimensionRows])

  const totals = useMemo(() => {
    const units = focusedRows.reduce((sum, row) => sum + row.units, 0)
    const pricedUnits = focusedRows.reduce((sum, row) => sum + (externalAmount(row, priceSource) === null ? 0 : row.units), 0)
    const internalPricedUnits = focusedRows.reduce((sum, row) => sum + (row.internalCost === null ? 0 : row.units), 0)
    const internal = sumNullable(focusedRows.map((row) => row.internalCost))
    const comparisonInternal = sumNullable(focusedRows.map((row) => externalAmount(row, priceSource) === null ? null : row.internalCost))
    const external = sumNullable(focusedRows.map((row) => externalAmount(row, priceSource)))
    const comparableExternal = sumNullable(focusedRows.map((row) =>
      externalAmount(row, priceSource) !== null && row.internalCost !== null
        ? externalAmount(row, priceSource)
        : null,
    ))
    const savings = sumNullable(focusedRows.map((row) => savingsAmount(row, priceSource)))
    const savingsRate = comparableExternal && savings !== null ? Math.round((savings / comparableExternal) * 1000) / 10 : null
    return { units, pricedUnits, internalPricedUnits, internal, comparisonInternal, external, comparableExternal, savings, savingsRate }
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
    setRange(`year:${data?.meta.asOf.slice(0, 4) ?? '2026'}`)
    setMajorTypes(new Set(['CAD', 'Zr', 'Other']))
    setDetailType('all')
    setSelectedMonth(null)
  }

  if (error) return <ErrorState message={error} />
  if (!data || !retainerData) return <LoadingState />

  const latestMonth = monthRows.filter((row) => row.total > 0).at(-1)
  const statusText = selectedMonth
    ? `${formatMonth(selectedMonth)}を選択中`
    : `${monthRows.length}か月を表示`
  const unpricedUnits = totals.units - totals.pricedUnits
  const internalUnpricedUnits = totals.units - totals.internalPricedUnits
  const savingsExcludedUnits = focusedRows.reduce((sum, row) =>
    sum + (externalAmount(row, priceSource) !== null && row.internalCost === null ? row.units : 0),
  0)
  const displayedGeneratedAt = view === 'retainer' ? retainerData.meta.generatedAt : data.meta.generatedAt

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
            <span>{new Date(displayedGeneratedAt).toLocaleString('ja-JP')}</span>
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
          aria-current={view === 'insurance' ? 'page' : undefined}
          onClick={() => setView('insurance')}
        >
          保険点数・診療報酬
        </button>
        <button
          type="button"
          aria-current={view === 'priceComparison' ? 'page' : undefined}
          onClick={() => setView('priceComparison')}
        >
          外注単価比較
        </button>
        <button
          type="button"
          aria-current={view === 'retainer' ? 'page' : undefined}
          onClick={() => setView('retainer')}
        >
          リテーナー
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
            {calendarYears.map((year) => <option key={year} value={`year:${year}`}>{calendarYearLabel(year)}</option>)}
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
          note={totals.savingsRate === null
            ? '算定不可'
            : savingsExcludedUnits
              ? `院内原価未設定 ${savingsExcludedUnits}本を除外／比較可能額比 ${totals.savingsRate}%`
              : `外注相当額比 ${totals.savingsRate}%`}
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
                  <XAxis dataKey="month" tickFormatter={(value) => axisMonthLabel(String(value))} tickLine={false} axisLine={false} />
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
                <span className="scenario-badge">{OUTSOURCE_PRICE_LABELS[priceSource]}・院内原価設定済み</span>
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

          <div className="chart-grid">
            <section className="chart-card chart-card--wide">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">CLINIC MIX</p>
                  <h2>医院別 制作構成</h2>
                </div>
                <p>{clinicExcludedUnits ? `東松原・下北沢以外 ${numberFormat.format(clinicExcludedUnits)}本を除外` : '東松原／下北沢'}</p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart accessibilityLayer>
                  <Pie data={clinicRows} dataKey="units" nameKey="clinic" cx="50%" cy="47%" innerRadius={62} outerRadius={104} paddingAngle={2} label>
                    {clinicRows.map((row, index) => <Cell key={row.clinic} fill={index === 0 ? '#2563eb' : '#0f766e'} />)}
                  </Pie>
                  <Tooltip formatter={(value, _, item) => [`${numberFormat.format(Number(value ?? 0))}本（${item?.payload?.share ?? 0}%）`, '制作本数']} />
                  <Legend verticalAlign="bottom" />
                </PieChart>
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
      ) : view === 'insurance' ? (
        <InsuranceDashboard data={data} basis={basis} onBasisChange={(nextBasis) => { setBasis(nextBasis); setSelectedMonth(null) }} />
      ) : view === 'priceComparison' ? (
        <PriceComparison />
      ) : (
        <RetainerDashboard data={retainerData} />
      )}

      <footer>
        {view === 'performance' ? (
          <>
            <p>集計基準日 {data.meta.asOf} ／ 価格マスター {data.meta.priceMasterVersion} ／ 実績金額は概算です</p>
            <p>院内原価には設備償却・再製作・管理費を含みません。</p>
          </>
        ) : view === 'insurance' ? (
          <>
            <p>保険点数マスター {data.meta.insuranceMasterVersion} ／ {data.insuranceMaster.schedule}</p>
            <p>表示額は算定前提に基づく試算です。実請求はレセプト条件・材料区分を確認してください。</p>
          </>
        ) : view === 'priceComparison' ? (
          <>
            <p>比較単価マスター {vendorPriceComparison.version}</p>
            <p>消費税・連結料・ブロック条件・再製作条件は各社へ確認してください。</p>
          </>
        ) : (
          <>
            <p>リテーナー原価マスター {retainerData.meta.masterVersion} ／ 集計基準日 {retainerData.meta.asOf}</p>
            <p>直接費控除後残額には、人件費・失敗・設備償却・廃棄・教育時間を含みません。</p>
          </>
        )}
      </footer>
    </div>
  )
}

export default App
