import type { MonthlyAggregate, Scenario } from '../types'

export function externalAmount(row: MonthlyAggregate, scenario: Scenario) {
  if (scenario === 'low') return row.externalLow
  if (scenario === 'high') return row.externalHigh
  return row.externalMid
}

export function savingsAmount(row: MonthlyAggregate, scenario: Scenario) {
  const external = externalAmount(row, scenario)
  if (external === null || row.internalCost === null) return null
  return external - row.internalCost
}

export function sumNullable(values: Array<number | null>) {
  const priced = values.filter((value): value is number => value !== null)
  return priced.length ? priced.reduce((sum, value) => sum + value, 0) : null
}

export function formatYen(value: number | null) {
  return value === null ? '未設定' : `${new Intl.NumberFormat('ja-JP').format(value)}円`
}

export function formatCompactYen(value: number) {
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString('ja-JP')}万円`
  return `${value.toLocaleString('ja-JP')}円`
}

export function formatMonth(month: string) {
  const [year, value] = month.split('-')
  return `${year}年${Number(value)}月`
}
