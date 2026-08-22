import { describe, expect, it } from 'vitest'
import { externalAmount, savingsAmount, sumNullable } from '../src/lib/metrics'
import type { MonthlyAggregate } from '../src/types'

const baseRow: MonthlyAggregate = {
  month: '2026-08',
  dateBasis: 'date',
  majorType: 'CAD',
  detailType: 'CAD冠（大臼歯）',
  units: 1,
  futureUnits: 0,
  internalCost: 1500,
  externalLow: 7500,
  externalMid: 8500,
  externalHigh: 9500,
  isPartialMonth: true,
  isFutureMonth: false,
}

describe('amount calculations', () => {
  it('uses the selected external price scenario', () => {
    expect(externalAmount(baseRow, 'low')).toBe(7500)
    expect(externalAmount(baseRow, 'mid')).toBe(8500)
    expect(externalAmount(baseRow, 'high')).toBe(9500)
  })

  it('calculates CAD standard savings as 7,000 yen per unit', () => {
    expect(savingsAmount(baseRow, 'mid')).toBe(7000)
  })

  it('calculates Zr standard savings as 5,920 yen per unit', () => {
    const zrRow = {
      ...baseRow,
      majorType: 'Zr' as const,
      internalCost: 4580,
      externalLow: 9000,
      externalMid: 10500,
      externalHigh: 12000,
    }
    expect(savingsAmount(zrRow, 'mid')).toBe(5920)
  })

  it('does not treat unpriced rows as zero', () => {
    const unpriced = {
      ...baseRow,
      majorType: 'Other' as const,
      internalCost: null,
      externalLow: null,
      externalMid: null,
      externalHigh: null,
    }
    expect(savingsAmount(unpriced, 'mid')).toBeNull()
    expect(sumNullable([null, null])).toBeNull()
  })
})
