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
})
