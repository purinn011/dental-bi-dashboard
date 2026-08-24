import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DashboardData } from '../src/types'

const data = JSON.parse(
  readFileSync(new URL('../public/data/dashboard.json', import.meta.url), 'utf8'),
) as DashboardData

describe('generated dashboard data', () => {
  it('matches the provisional source-data control totals', () => {
    expect(data.meta.sourceRows).toBe(1924)
    expect(data.meta.acceptedRows).toBe(1822)
    expect(data.meta.reviewRows).toBe(102)
    expect(data.meta.expandedUnits).toBe(2043)
    expect(data.meta.validDateUnits).toBe(2039)
    expect(data.meta.validSetDateUnits).toBe(1954)

    const dateUnits = data.monthly
      .filter((row) => row.dateBasis === 'date')
      .reduce((sum, row) => sum + row.units, 0)
    const setDateUnits = data.monthly
      .filter((row) => row.dateBasis === 'setDate')
      .reduce((sum, row) => sum + row.units, 0)

    expect(dateUnits).toBe(2039)
    expect(setDateUnits).toBe(1954)
  })

  it('contains only aggregated, allowlisted monthly fields', () => {
    const allowed = new Set([
      'month', 'dateBasis', 'majorType', 'detailType', 'units', 'futureUnits',
      'internalCost', 'externalLow', 'externalMid', 'externalHigh',
      'isPartialMonth', 'isFutureMonth',
    ])
    for (const row of data.monthly) {
      expect(Object.keys(row).every((key) => allowed.has(key))).toBe(true)
    }
  })

  it('keeps Other rows unpriced instead of converting them to zero', () => {
    const others = data.monthly.filter((row) => row.majorType === 'Other')
    expect(others.length).toBeGreaterThan(0)
    expect(others.every((row) => row.internalCost === null && row.externalMid === null)).toBe(true)
  })

  it('applies the revised fixed external prices by detail type', () => {
    const expectedPrices = new Map([
      ['CADインレー（小臼歯）', 7500],
      ['CADインレー（大臼歯）', 7500],
      ['CAD冠（前歯）', 9000],
      ['CAD冠（小臼歯）', 9000],
      ['CAD冠（大臼歯）', 9000],
      ['Zrインレー', 12000],
      ['Zrクラウン', 12000],
    ])

    for (const [detailType, unitPrice] of expectedPrices) {
      const rows = data.monthly.filter((row) => row.detailType === detailType)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((row) => row.externalLow === row.units * unitPrice)).toBe(true)
    }
  })

  it('stores vendor prices without converting missing prices to zero', () => {
    const smallInlays = data.monthly.filter((row) => row.detailType === 'CADインレー（小臼歯）')
    expect(smallInlays.every((row) => row.externalMid === row.units * 6560)).toBe(true)
    expect(smallInlays.every((row) => row.externalHigh === row.units * 7500)).toBe(true)

    const zirconiaCrowns = data.monthly.filter((row) => row.detailType === 'Zrクラウン')
    expect(zirconiaCrowns.every((row) => row.externalMid === null)).toBe(true)
    expect(zirconiaCrowns.every((row) => row.externalHigh === row.units * 13000)).toBe(true)
  })
})
